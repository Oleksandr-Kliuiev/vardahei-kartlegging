// Shared reconciliation failure: rollback the import and retain a failed manifest.
export class ImportMismatch extends Error {
  override name = 'ImportMismatch';
}
