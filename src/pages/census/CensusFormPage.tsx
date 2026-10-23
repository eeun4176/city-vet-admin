import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CensusSheetEditor, type SheetValues } from '../../components/CensusSheetEditor';
import { Loading, Notice, btnGhost } from '../../components/ui';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fromDetail, type SubmissionDetail } from '../../lib/census';
import { useApi } from '../../lib/useApi';

/** New digital census sheet (`/census/new`) or correction of a pending one (`/census/mine/:id/edit`). */
export function CensusFormPage() {
  const { t } = useT();
  const { account } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const { data, loading, error } = useApi<SubmissionDetail>(id ? `/census/submissions/${id}` : null);
  const initial = useMemo(() => (data ? {
    label: data.submission.label, censusDate: data.submission.censusDate, householdsVisited: data.submission.householdsVisited, owners: fromDetail(data.owners),
  } : undefined), [data]);

  if (id && loading) return <Loading />;
  if (id && (error || !data)) return <Notice kind="error">{error?.message ?? t('common.loadFailed')}</Notice>;
  if (data && data.submission.status !== 'pending') {
    return <Notice>{t('census.status.' + data.submission.status as 'census.status.pending')} <Link className="underline" to={`/census/mine/${id}`}>{t('common.back')}</Link></Notice>;
  }

  async function submit(values: SheetValues) {
    if (id) await api('PATCH', `/census/submissions/${id}`, values);
    else await api('POST', '/census/submissions', { ...values, source: 'form' });
    navigate('/census/mine', { replace: true, state: { notice: id ? t('census.saved') : t('census.submitted') } });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">{t(id ? 'census.edit.title' : 'census.new.title')}</h1>
      {!id && <p className="mt-1 text-sm text-slate-500">{t('census.new.intro')}</p>}
      <div className="mt-6">
        <CensusSheetEditor initial={initial} barangay={account?.barangay} submitLabel={t(id ? 'census.save' : 'census.submit')} onSubmit={submit} />
      </div>
      <Link to="/census/mine" className={`${btnGhost} mt-6`}>{t('common.back')}</Link>
    </div>
  );
}
