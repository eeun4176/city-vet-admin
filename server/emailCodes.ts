import { createHash, randomInt } from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import { config } from './config';
import { sql, type Tx } from './db';
import { AppError } from './errors';

/**
 * 6-digit codes sent by email: to confirm a paravet's email address, and to reset a forgotten password.
 * Codes are stored hashed, last 10 minutes and allow 5 tries; at most 3 are sent per account and purpose in 30 minutes.
 * Mail goes out through the office Gmail account (GMAIL_USER + an app password).
 */
export type CodePurpose = 'verify-email' | 'reset-password';
export const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const MAX_SENDS = 3;
const SEND_WINDOW_MINUTES = 30;

/** Outside production, with no Gmail account set up, mail lands here instead (local development and tests read it). */
export const devOutbox: { to: string; subject: string; text: string }[] = [];
let transport: Transporter | undefined;

/** Whether mail can be sent; production without a Gmail account cannot. */
export const mailReady = () => Boolean(config().gmailUser && config().gmailAppPassword) || !config().isProd;

export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  const { gmailUser, gmailAppPassword } = config();
  if (!gmailUser || !gmailAppPassword) {
    if (!mailReady()) throw new AppError(503, 'EMAIL_NOT_CONFIGURED', 'Email is not set up on the City Veterinary Office server yet. Ask the office to reset your password.');
    devOutbox.push({ to, subject, text });
    return;
  }
  transport ??= nodemailer.createTransport({ service: 'gmail', auth: { user: gmailUser, pass: gmailAppPassword } });
  await transport.sendMail({ from: { name: 'City Veterinary Office', address: gmailUser }, to, subject, text });
}

const hash = (accountId: number, purpose: CodePurpose, code: string) =>
  createHash('sha256').update(`${accountId}:${purpose}:${code}:${config().jwtSecret}`).digest('hex');

/** A new code for `purpose` (replacing any earlier one), or null when 3 were already sent in the last 30 minutes. */
export async function issueCode(q: Tx, accountId: number, purpose: CodePurpose, email: string): Promise<string | null> {
  const [{ n }] = await q`select count(*)::int as n from ekapon.email_codes
    where account_id = ${accountId} and purpose = ${purpose} and created_at > now() - make_interval(mins => ${SEND_WINDOW_MINUTES})`;
  if (n >= MAX_SENDS) return null;
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await q`update ekapon.email_codes set used_at = now() where account_id = ${accountId} and purpose = ${purpose} and used_at is null`;
  await q`insert into ekapon.email_codes (account_id, purpose, email, code_hash, expires_at)
    values (${accountId}, ${purpose}, ${email}, ${hash(accountId, purpose, code)}, now() + make_interval(mins => ${CODE_MINUTES}))`;
  return code;
}

/**
 * Uses up the account's latest open code for `purpose` if `code` matches, and returns the email it was sent to.
 * Runs outside a transaction on purpose: a wrong try must stay counted even though the request then fails.
 */
export async function consumeCode(accountId: number, purpose: CodePurpose, code: string): Promise<string> {
  const [row] = await sql()`select id, code_hash, attempts, expires_at > now() as live from ekapon.email_codes
    where account_id = ${accountId} and purpose = ${purpose} and used_at is null order by created_at desc limit 1`;
  if (!row || !row.live || row.attempts >= MAX_ATTEMPTS) throw new AppError(410, 'CODE_EXPIRED', 'This code has expired or was tried too many times. Send a new code.');
  if (row.code_hash !== hash(accountId, purpose, code)) {
    const [{ attempts }] = await sql()`update ekapon.email_codes set attempts = attempts + 1 where id = ${row.id} returning attempts`;
    throw new AppError(401, 'INVALID_CODE', 'That code is not right. Check the latest email and try again.', { attemptsLeft: Math.max(0, MAX_ATTEMPTS - attempts) });
  }
  // `used_at is null` again: of two requests with the same code, only one gets through.
  const [used] = await sql()`update ekapon.email_codes set used_at = now() where id = ${row.id} and used_at is null returning email`;
  if (!used) throw new AppError(410, 'CODE_EXPIRED', 'This code was already used. Send a new code.');
  return used.email as string;
}
