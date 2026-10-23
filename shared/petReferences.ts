export const BREED_CLASSES = ['Mongrel','Mix','Pure','Unknown'] as const;
export const HEALTH_STATUSES = ['Yes','No','Unknown'] as const;
export type HealthStatus = typeof HEALTH_STATUSES[number];
export const PET_BREEDS = {
 Dog: ['Unknown','Aspin','Mixed breed','American Bully','Beagle','Belgian Malinois','Boxer','Bullmastiff','Chihuahua','Chow Chow','Cocker Spaniel','Dachshund','Dalmatian','Doberman Pinscher','French Bulldog','German Shepherd','Golden Retriever','Great Dane','Jack Russell Terrier','Japanese Spitz','Labrador Retriever','Maltese','Pembroke Welsh Corgi','Pitbull','Pomeranian','Poodle','Pug','Rottweiler','Samoyed','Shih Tzu','Siberian Husky'],
 Cat: ['Unknown','Puspin','Mixed breed','Domestic Shorthair','Bengal','British Shorthair','Maine Coon','Persian','Ragdoll','Russian Blue','Scottish Fold','Siamese'],
} as const;
export const healthStatus = (value:unknown):HealthStatus => value===true||value==='Yes'||value==='Vaccinated'?'Yes':value===false||value==='No'||value==='Unvaccinated'?'No':'Unknown';
