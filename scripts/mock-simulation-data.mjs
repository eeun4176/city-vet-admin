export const MOCK_BATCH = 'module-c-mock-simulation-v4';
const PREVIOUS_BATCHES = [
  'module-c-local-sample-v1',
  'module-c-mock-simulation-v2',
  'module-c-mock-simulation-v3',
];
const START = Date.UTC(2025, 0, 1);
const DAY_COUNT = 638;

const firstNames = [
  'Aaliyah', 'Abigail', 'Adrian', 'Althea', 'Amara', 'Andrea', 'Andres', 'Angela', 'Antonio', 'Arianna',
  'Beatriz', 'Benjamin', 'Bianca', 'Brianna', 'Carlos', 'Carmina', 'Carmela', 'Cesar', 'Clarissa', 'Daniel',
  'Danica', 'David', 'Diana', 'Dominic', 'Eduardo', 'Elaine', 'Elijah', 'Emmanuel', 'Erika', 'Estrella',
  'Faith', 'Felix', 'Frances', 'Gabriel', 'Gemma', 'Hannah', 'Ian', 'Isabella', 'Jasmine', 'Joaquin',
  'Joy', 'Julian', 'Katrina', 'Lorenzo', 'Louise', 'Lucas', 'Maureen', 'Miguel', 'Nadine', 'Nathan',
];
const lastNames = [
  'Aguilar', 'Alonzo', 'Aquino', 'Bautista', 'Castillo', 'Cruz', 'Dela Cruz', 'Domingo', 'Fernandez', 'Garcia',
  'Gonzales', 'Hernandez', 'Lim', 'Lopez', 'Mendoza', 'Navarro', 'Reyes', 'Rivera', 'Santos', 'Torres',
];
const petNames = ['Bantay', 'Brownie', 'Chichi', 'Cookie', 'Daisy', 'Datu', 'Ginger', 'Kiko', 'Luna', 'Milo', 'Mingming', 'Muning', 'Pepper', 'Rex', 'Shadow', 'Tala', 'Teddy', 'Tisoy', 'Whiskers', 'Yumi'];
const paravetNames = [
  ['Aira', 'Santos'], ['Miguel', 'Reyes'], ['Liza', 'Mendoza'], ['Carlo', 'Garcia'],
  ['Jessa', 'Flores'], ['Ramon', 'Cruz'], ['Nina', 'Bautista'], ['Paolo', 'Ramos'],
];
const userNames = [
  ['Althea', 'Villanueva'], ['Marco', 'Santiago'], ['Leah', 'Aquino'], ['Dante', 'Navarro'],
  ['Mika', 'Domingo'], ['Julius', 'Castillo'], ['Rhea', 'Fernandez'], ['Nico', 'Alonzo'],
  ['Celine', 'Gonzales'], ['Arman', 'Torres'], ['Mara', 'Lopez'], ['Enzo', 'Rivera'],
];
const statuses = ['approved', 'pending', 'rejected', 'approved'];
const sources = ['form', 'csv'];
const species = ['Dog', 'Cat'];
const sexes = ['Male', 'Female'];
const confinements = ['Confined', 'Semi-confined', 'Free-roaming'];
const services = ['Kapon', 'Anti-rabies', 'Microchip'];
const verificationStatuses = ['verified', 'verified', 'rejected', 'pending'];

function dateAt(index) {
  return new Date(START + (index % DAY_COUNT) * 86_400_000).toISOString().slice(0, 10);
}
function timestamp(day, hour = 10) {
  return `${day}T${String(hour).padStart(2, '0')}:00:00+08:00`;
}
function monthlyDate(index) {
  const year = 2025 + Math.floor(index / 12);
  const month = index % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(4 + (index * 7) % 25, lastDay);
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}
function mobile(index) {
  return `09${['17', '18', '19', '26', '27', '28', '35', '36'][index % 8]}-${String(100 + index).padStart(3, '0')}-${String((index * 73 + 11) % 10000).padStart(4, '0')}`;
}
function personName(index) {
  return `${firstNames[index % firstNames.length]} ${lastNames[Math.floor(index / firstNames.length) % lastNames.length]}`;
}
function record(dataset, id, data, createdAt) {
  return { dataset, record_id: id, record_data: { id, ...data, _sampleData: true, _sampleBatchId: MOCK_BATCH }, created_at: timestamp(createdAt), updated_at: timestamp(createdAt, 12) };
}
function petDetails(ownerIndex, petIndex) {
  const speciesValue = species[(ownerIndex + petIndex) % species.length];
  const sex = sexes[(ownerIndex + petIndex * 2) % sexes.length];
  return {
    petName: `${petNames[(ownerIndex * 2 + petIndex) % petNames.length]} ${String(ownerIndex + 1).padStart(3, '0')}`,
    species: speciesValue,
    sex,
    ageMonths: (ownerIndex * 11 + petIndex * 17) % 181,
    breedType: ownerIndex % 3 === 0 ? 'Pure' : 'Mongrel',
    color: ['Brown', 'Black', 'White', 'Golden', 'Brindle', 'Calico', 'Gray'][ownerIndex % 7],
    sterilized: ownerIndex % 4 === petIndex,
    confinement: confinements[(ownerIndex + petIndex) % confinements.length],
    vaccine1st: ownerIndex % 2 === 0,
    vaccine2nd: ownerIndex % 3 === 0,
    vaccine3rd: ownerIndex % 5 === 0,
    vaccineOther: ownerIndex % 4 === 0 ? 'Anti-rabies' : null,
    booster: ownerIndex % 3 === 1,
    laps: ownerIndex % 7 === 0,
    registeredYear: 2025 + (ownerIndex % 2),
    remarks: ownerIndex % 6 === 0 ? 'Follow-up visit scheduled.' : null,
  };
}

async function addPortalAccounts(db, barangays) {
  const [admin] = (await db.query("select id, full_name from ekapon.accounts where username = 'sampleadmin'")).rows;
  if (!admin) throw new Error('The local sampleadmin account must exist before mock records are seeded.');

  const paravets = [];
  for (let index = 0; index < paravetNames.length; index++) {
    const [first, last] = paravetNames[index];
    const barangay = barangays[(index * 7) % barangays.length];
    let [account] = (await db.query(
      `select id, full_name, barangay_id from ekapon.accounts
        where account_type = 'Paravet' and first_name = $1 and last_name = $2 and middle_name = 'Simulation' and barangay_id = $3 and archived_at is null`,
      [first, last, barangay.id],
    )).rows;
    if (!account) {
      [account] = (await db.query(
        `insert into ekapon.accounts (account_type, first_name, middle_name, last_name, mobile, barangay_id, password_hash, created_at, updated_at)
         values ('Paravet', $1, 'Simulation', $2, $3, $4, extensions.crypt('MockVet!2026', extensions.gen_salt('bf', 4)), $5::timestamptz, $5::timestamptz)
         returning id, full_name, barangay_id`,
        [first, last, mobile(index + 400), barangay.id, timestamp(dateAt(index * 23))],
      )).rows;
    }
    paravets.push({ id: account.id, name: account.full_name, barangayId: account.barangay_id, barangay: barangay.name });
  }

  const users = [];
  for (let index = 0; index < userNames.length; index++) {
    const [first, last] = userNames[index];
    const barangay = barangays[(index * 5 + 2) % barangays.length];
    let [account] = (await db.query(
      `select id, full_name, barangay_id from ekapon.accounts
        where account_type = 'User' and first_name = $1 and last_name = $2 and middle_name = 'Simulation' and barangay_id = $3 and archived_at is null`,
      [first, last, barangay.id],
    )).rows;
    if (!account) {
      [account] = (await db.query(
        `insert into ekapon.accounts (account_type, first_name, middle_name, last_name, mobile, barangay_id, password_hash, created_at, updated_at)
         values ('User', $1, 'Simulation', $2, $3, $4, extensions.crypt('MockUser!2026', extensions.gen_salt('bf', 4)), $5::timestamptz, $5::timestamptz)
         returning id, full_name, barangay_id`,
        [first, last, mobile(index + 800), barangay.id, timestamp(dateAt(index * 31 + 9))],
      )).rows;
    }
    users.push({ id: account.id, name: account.full_name, barangayId: account.barangay_id });
  }
  return { admin, paravets, users };
}

async function seedRecords(db, barangays, paravets) {
  const records = [];
  const ownerCount = 150;
  const owners = Array.from({ length: ownerCount }, (_, index) => {
    const name = personName(index);
    const barangay = barangays[(index * 11) % barangays.length];
    const owner = {
      id: `sim-owner-${String(index + 1).padStart(4, '0')}`,
      name,
      owner_name: name,
      address: `Purok ${(index % 9) + 1}, Block ${(index % 18) + 1}`,
      barangay: barangay.name,
      contact: mobile(index),
      source: ['Door-to-door census', 'Barangay referral', 'Program registration'][index % 3],
      verification: ['Verified', 'Pending review', 'Needs follow-up'][index % 3],
      created_at: dateAt(Math.round(index * (DAY_COUNT - 1) / (ownerCount - 1))),
    };
    records.push(record('owners', owner.id, owner, owner.created_at));
    return { ...owner, _index: index };
  });

  const petRows = [];
  for (const owner of owners) {
    for (let petIndex = 0; petIndex < 2; petIndex++) {
      const detail = petDetails(owner._index, petIndex);
      const id = `sim-pet-${String(owner._index * 2 + petIndex + 1).padStart(4, '0')}`;
      const pet = {
        id,
        name: detail.petName,
        pet_name: detail.petName,
        owner_id: owner.id,
        owner: owner.name,
        owner_name: owner.name,
        barangay: owner.barangay,
        species: detail.species,
        sex: detail.sex,
        age_months: detail.ageMonths,
        breed_type: detail.breedType,
        color: detail.color,
        sterilized: detail.sterilized,
        confinement: detail.confinement,
        vaccine_1st: detail.vaccine1st,
        vaccine_2nd: detail.vaccine2nd,
        vaccine_3rd: detail.vaccine3rd,
        vaccine_other: detail.vaccineOther,
        booster: detail.booster,
        laps: detail.laps,
        registered_year: detail.registeredYear,
        remarks: detail.remarks,
        created_at: owner.created_at,
      };
      petRows.push(pet);
      records.push(record('pets', id, pet, owner.created_at));
    }
  }

  for (const [index, paravet] of paravets.entries()) {
    const data = {
      id: `sim-paravet-${String(index + 1).padStart(3, '0')}`,
      name: paravet.name,
      account_key: null,
      barangay: paravet.barangay,
      mobile: mobile(index + 400),
      account_status: 'Active',
      census_status: ['Pending review', 'Current', 'Follow-up needed'][index % 3],
      verified: index % 4 !== 0,
      assigned_since: dateAt(index * 19),
      created_at: dateAt(index * 19),
    };
    records.push(record('paravets', data.id, data, data.created_at));
  }

  for (let index = 0; index < 120; index++) {
    const owner = owners[index % owners.length];
    const paravet = paravets[index % paravets.length];
    const visitDate = dateAt(index * 5 + 1);
    const data = {
      id: `sim-household-${String(index + 1).padStart(4, '0')}`,
      name: `Household ${owner.name}`,
      household_head: owner.name,
      owner_id: owner.id,
      address: owner.address,
      barangay: owner.barangay,
      paravet: paravet.name,
      pets_count: 2,
      animals_recorded: 2,
      visit_date: visitDate,
      verification_status: ['Verified', 'Pending', 'Returned for correction'][index % 3],
      source: 'Door-to-door census simulation',
      created_at: visitDate,
    };
    records.push(record('households', data.id, data, visitDate));
  }

  for (let index = 0; index < 100; index++) {
    const owner = owners[index % owners.length];
    const pet = petRows[index % petRows.length];
    const data = {
      id: `sim-animal-${String(index + 1).padStart(4, '0')}`,
      name: pet.name,
      pet_name: pet.name,
      owner: owner.name,
      owner_id: owner.id,
      species: pet.species,
      sex: pet.sex,
      barangay: owner.barangay,
      census_date: dateAt(index * 5 + 1),
      registration_status: ['Registered', 'Pending', 'Needs verification'][index % 3],
      vaccine_1st: pet.vaccine_1st,
      vaccine_2nd: pet.vaccine_2nd,
      vaccine_3rd: pet.vaccine_3rd,
    };
    records.push(record('animals', data.id, data, dateAt(index * 5 + 1)));
  }

  const programDates = new Set();
  const existingPrograms = (await db.query(
    `select record_data from ekapon.dashboard_records
      where dataset = 'programs' and record_data->>'_sampleBatchId' is distinct from $1`,
    [MOCK_BATCH],
  )).rows;
  for (const row of existingPrograms) programDates.add(`${String(row.record_data.barangay).toLowerCase()}|${row.record_data.date}`);
  for (let index = 0; index < 42; index++) {
    const barangay = barangays[index % barangays.length];
    const monthDate = monthlyDate(index % 21);
    const [year, month] = monthDate.split('-').map(Number);
    let eventDate = monthDate;
    for (let day = 1; day <= 28; day++) {
      const candidate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const key = `${barangay.name.toLowerCase()}|${candidate}`;
      if (!programDates.has(key)) { eventDate = candidate; programDates.add(key); break; }
    }
    const kind = ['paravet', 'vaccination', 'clinic', 'followup'][index % 4];
    const data = {
      id: `sim-program-${String(index + 1).padStart(3, '0')}`,
      name: `${['Field visit', 'Anti-rabies vaccination', 'Kapon clinic', 'Post-program follow-up'][index % 4]} ${String(index + 1).padStart(2, '0')}`,
      title: `${['Field visit', 'Anti-rabies vaccination', 'Kapon clinic', 'Post-program follow-up'][index % 4]} ${String(index + 1).padStart(2, '0')}`,
      program: services[index % services.length],
      type: kind,
      date: eventDate,
      barangay: barangay.name,
      barangayId: barangay.id,
      status: ['Completed', 'Scheduled', 'Pending approval', 'Cancelled'][index % 4],
      slots: 25 + index % 30,
      left: 5 + index % 18,
      paravet: paravets[index % paravets.length].name,
      created_at: eventDate,
    };
    records.push(record('programs', data.id, data, eventDate));
  }

  for (let index = 0; index < 70; index++) {
    const owner = owners[index % owners.length];
    const eventDate = dateAt(index * 7 + 12);
    const data = {
      id: `sim-service-${String(index + 1).padStart(4, '0')}`,
      service: services[index % services.length],
      outcome: ['Completed', 'Scheduled', 'Needs follow-up'][index % 3],
      owner: owner.name,
      owner_id: owner.id,
      pet: petRows[index % petRows.length].name,
      barangay: owner.barangay,
      date: eventDate,
      provider: paravets[index % paravets.length].name,
      verification_status: ['Verified', 'Pending'][index % 2],
    };
    records.push(record('services', data.id, data, eventDate));
  }

  let analyticsServiceIndex = 0;
  for (let monthIndex = 0; monthIndex < 21; monthIndex++) {
    const antiRabiesCount = 2 + Math.floor(monthIndex / 7);
    const servicePlan = [
      ...Array.from({ length: antiRabiesCount }, () => 'Anti-rabies'),
      ...Array.from({ length: 1 + (monthIndex % 2) }, () => 'Kapon'),
      'Microchip',
    ];
    for (const [serviceIndex, service] of servicePlan.entries()) {
      const ownerIndex = (monthIndex * 17 + serviceIndex * 13) % owners.length;
      const owner = owners[ownerIndex];
      const date = monthlyDate(monthIndex);
      const [year, month] = date.split('-').map(Number);
      const eventDay = Math.min(3 + serviceIndex * 5, new Date(Date.UTC(year, month, 0)).getUTCDate());
      const eventDate = `${year}-${String(month).padStart(2, '0')}-${String(eventDay).padStart(2, '0')}`;
      const outcome = (monthIndex + serviceIndex) % 6 === 0 ? 'Scheduled' : 'Completed';
      const data = {
        id: `sim-analytics-service-${String(++analyticsServiceIndex).padStart(4, '0')}`,
        service,
        outcome,
        owner: owner.name,
        owner_id: owner.id,
        pet: petRows[(ownerIndex * 2 + serviceIndex) % petRows.length].name,
        barangay: owner.barangay,
        date: eventDate,
        provider: paravets[(monthIndex + serviceIndex) % paravets.length].name,
        verification_status: 'Verified',
      };
      records.push(record('services', data.id, data, eventDate));
    }
  }

  for (let index = 0; index < 80; index++) {
    const owner = owners[index % owners.length];
    const date = dateAt(index * 7 + 20);
    const data = {
      id: `sim-stub-${String(index + 1).padStart(4, '0')}`,
      stub_number: `SIM-${String(index + 1).padStart(5, '0')}`,
      owner: owner.name,
      owner_id: owner.id,
      barangay: owner.barangay,
      service: services[index % services.length],
      status: ['Completed', 'Attended', 'Registered', 'Issued'][index % 4],
      date,
      verification_status: index % 5 === 0 ? 'Pending' : 'Verified',
    };
    records.push(record('stubs', data.id, data, date));
  }

  for (let index = 0; index < 90; index++) {
    const owner = owners[index % owners.length];
    const date = dateAt(index * 6 + 30);
    const data = {
      id: `sim-participant-${String(index + 1).padStart(4, '0')}`,
      name: owner.name,
      owner_id: owner.id,
      program_id: `sim-program-${String(index % 42 + 1).padStart(3, '0')}`,
      barangay: owner.barangay,
      registration_date: date,
      status: ['Verified', 'Pending verification', 'Attended'][index % 3],
    };
    records.push(record('participants', data.id, data, date));
  }

  for (let index = 0; index < 60; index++) {
    const owner = owners[index % owners.length];
    const date = dateAt(index * 8 + 41);
    const data = {
      id: `sim-respondent-${String(index + 1).padStart(4, '0')}`,
      name: owner.name,
      owner_id: owner.id,
      barangay: owner.barangay,
      response: ['Willing', 'Needs more information', 'Not available'][index % 3],
      visit_date: date,
      paravet: paravets[index % paravets.length].name,
      verification_status: ['Verified', 'Pending'][index % 2],
    };
    records.push(record('respondents', data.id, data, date));
  }

  await db.query(
    `insert into ekapon.dashboard_records (dataset, record_id, record_data, archived, created_at, updated_at)
     select x.dataset, x.record_id, x.record_data, false, x.created_at, x.updated_at
       from jsonb_to_recordset($1::jsonb) as x(dataset text, record_id text, record_data jsonb, created_at timestamptz, updated_at timestamptz)
     on conflict (dataset, record_id) do update
       set record_data = excluded.record_data, archived = false, created_at = excluded.created_at, updated_at = excluded.updated_at`,
    [JSON.stringify(records)],
  );
  return { records: records.length, owners, petRows };
}

async function seedVerifications(db, barangays, admin, users) {
  for (let index = 0; index < users.length; index++) {
    const status = verificationStatuses[index % verificationStatuses.length];
    const submitted = dateAt(index * 43 + 5);
    const reviewDate = dateAt(index * 43 + 8);
    const barangay = barangays[(index * 5 + 2) % barangays.length];
    const [existing] = (await db.query(
      `select id from ekapon.id_verifications where user_id = $1 and submitted_at::date = $2::date`,
      [users[index].id, submitted],
    )).rows;
    if (existing) continue;
    const image = status === 'pending' ? Buffer.from(`SIMULATED-ID-${String(index + 1).padStart(3, '0')}`) : null;
    const [verification] = (await db.query(
      `insert into ekapon.id_verifications
         (user_id, barangay_id, mime, image, status, reviewer_id, reviewer_name, reviewed_at,
          decision_reason, submitted_at, purge_after, purged_at)
       values ($1, $2, 'image/jpeg', $3, $4, $5, $6, $7::timestamptz, $8, $9::timestamptz, $10::timestamptz, $11::timestamptz)
       returning id`,
      [
        users[index].id,
        barangay.id,
        image,
        status,
        status === 'pending' ? null : admin.id,
        status === 'pending' ? null : admin.full_name,
        status === 'pending' ? null : timestamp(reviewDate, 14),
        status === 'rejected' ? 'Simulation: photo is not legible; please submit a clearer copy.' : null,
        timestamp(submitted, 9),
        status === 'pending' ? null : timestamp(reviewDate, 14),
        status === 'pending' ? null : timestamp(reviewDate, 14),
      ],
    )).rows;
    if (status === 'verified') {
      await db.query(`update ekapon.accounts set id_verified_at = $1::timestamptz where id = $2`, [timestamp(reviewDate, 14), users[index].id]);
    }
    if (status !== 'pending') {
      await db.query(
        `insert into ekapon.id_verification_log (verification_id, user_id, user_name, reviewer_id, reviewer_name, outcome, reason, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)`,
        [verification.id, users[index].id, users[index].name, admin.id, admin.full_name, status, status === 'rejected' ? 'Simulation: photo is not legible.' : null, timestamp(reviewDate, 14)],
      );
    }
  }
}

async function seedCensus(db, barangays, admin, paravets) {
  const [{ count }] = (await db.query("select count(*)::int as count from ekapon.census_submissions where label like 'SIMULATION · %'")).rows;
  if (count >= 21) return { submissions: Number(count), seeded: false };

  for (let index = 0; index < 21; index++) {
    const censusDate = monthlyDate(index);
    const status = statuses[index % statuses.length];
    const paravet = paravets[index % paravets.length];
    const barangay = barangays[(index * 3) % barangays.length];
    const reviewedAt = status === 'pending' ? null : timestamp(censusDate, 15);
    const [submission] = (await db.query(
      `insert into ekapon.census_submissions
         (barangay_id, submitted_by, submitter_name, source, census_date, label, households_visited,
          status, reviewed_by, reviewer_name, reviewed_at, review_note, created_at, updated_at)
       values ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11::timestamptz, $12, $13::timestamptz, $13::timestamptz)
       returning id`,
      [
        barangay.id, paravet.id, paravet.name, sources[index % sources.length], censusDate,
        `SIMULATION · ${barangay.name} census ${censusDate}`, 12 + (index % 29), status,
        status === 'pending' ? null : admin.id,
        status === 'pending' ? null : admin.full_name,
        reviewedAt,
        status === 'rejected' ? 'Simulation: please verify the vaccine details and resubmit.' : null,
        timestamp(censusDate, 11),
      ],
    )).rows;

    for (let ownerIndex = 0; ownerIndex < 6; ownerIndex++) {
      const personIndex = index * 6 + ownerIndex;
      const ownerName = personName(personIndex);
      const address = `Purok ${(ownerIndex % 9) + 1}, Block ${(personIndex % 25) + 1}`;
      const contact = mobile(personIndex);
      const decision = status === 'approved' ? 'new' : 'pending';
      const [censusOwner] = (await db.query(
        `insert into ekapon.census_owners (submission_id, line_no, owner_name, address, contact, decision)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [submission.id, ownerIndex + 1, ownerName, address, contact, decision],
      )).rows;

      let registryOwnerId = null;
      if (status === 'approved') {
        const [registryOwner] = (await db.query(
          `insert into ekapon.registry_owners (barangay_id, owner_name, address, contact, source_submission_id, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6::timestamptz, $6::timestamptz) returning id`,
          [barangay.id, ownerName, address, contact, submission.id, timestamp(censusDate, 12)],
        )).rows;
        registryOwnerId = registryOwner.id;
        await db.query(`update ekapon.census_owners set matched_owner_id = $1 where id = $2`, [registryOwnerId, censusOwner.id]);
      }

      for (let petIndex = 0; petIndex < 2; petIndex++) {
        const detail = petDetails(personIndex, petIndex);
        const values = [
          detail.petName, detail.species, detail.sex, detail.ageMonths, detail.breedType, detail.color,
          detail.sterilized, detail.confinement, detail.vaccine1st, detail.vaccine2nd, detail.vaccine3rd,
          detail.vaccineOther, detail.booster, detail.laps, detail.registeredYear, detail.remarks,
        ];
        await db.query(
          `insert into ekapon.census_pets
             (owner_id, line_no, pet_name, species, sex, age_months, breed_type, color, sterilized,
              confinement, vaccine_1st, vaccine_2nd, vaccine_3rd, vaccine_other, booster, laps, registered_year, remarks)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
          [censusOwner.id, petIndex + 1, ...values],
        );
        if (registryOwnerId) {
          await db.query(
            `insert into ekapon.registry_pets
               (owner_id, pet_name, species, sex, age_months, breed_type, color, sterilized, confinement,
                vaccine_1st, vaccine_2nd, vaccine_3rd, vaccine_other, booster, laps, registered_year, remarks, created_at, updated_at)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::timestamptz, $18::timestamptz)`,
            [registryOwnerId, ...values, timestamp(censusDate, 12)],
          );
        }
      }
    }
  }
  return { submissions: 21, seeded: true };
}

export async function seedMockSimulationData(db) {
  await db.exec('BEGIN');
  try {
  const barangays = (await db.query("select id, name, zip from ekapon.barangays where name <> 'Local Test Barangay' order by id")).rows;
  if (barangays.length < 10) throw new Error('Official barangay reference data is missing; cannot seed the mock simulation.');
  const existing = (await db.query(
    `select count(*)::int as count from ekapon.dashboard_records where record_data->>'_sampleBatchId' = $1`,
    [MOCK_BATCH],
  )).rows[0];
  const censusCount = (await db.query("select count(*)::int as count from ekapon.census_submissions where label like 'SIMULATION · %'")).rows[0];
  if (Number(existing.count) >= 700 && Number(censusCount.count) >= 21) {
    await db.exec('COMMIT');
    return { records: Number(existing.count), submissions: Number(censusCount.count), seeded: false };
  }

  await db.query(
    `delete from ekapon.dashboard_records where record_data->>'_sampleBatchId' = any($1::text[])`,
    [PREVIOUS_BATCHES],
  );
  const { admin, paravets, users } = await addPortalAccounts(db, barangays);
  const { records } = await seedRecords(db, barangays, paravets);
  await seedVerifications(db, barangays, admin, users);
  const census = await seedCensus(db, barangays, admin, paravets);
  await db.exec('COMMIT');
  return { records, submissions: census.submissions, seeded: true };
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}
