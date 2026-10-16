import leftPad from 'left-pad';

// Evaluated at package load: a broken npm resolution fails the boot, not just the method.
export const scopedNpmDep = { padded: leftPad('7', 3, '0') };
