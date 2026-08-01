/* eslint-disable no-undef */
// Non-destructive MongoDB production preflight and indexes.
// Run against the intended database with:
//   mongosh "$MONGODB_URI" --file database/migrations/2026_08_01_harden_mongodb_indexes.js
//
// The script aborts before creating indexes if it finds historical duplicates
// or if transactions are unavailable. It never updates or deletes documents.

const hello = db.adminCommand({ hello: 1 });
if (!hello.setName && hello.msg !== 'isdbgrid') {
  throw new Error(
    'MongoDB preflight failed: replica-set or sharded-cluster transaction support is required.',
  );
}

function assertNoDuplicates(collectionName, pipeline, label) {
  const examples = db.getCollection(collectionName)
    .aggregate([...pipeline, { $limit: 10 }], { allowDiskUse: true })
    .toArray();
  if (examples.length > 0) {
    throw new Error(
      `MongoDB preflight failed (${label}): ${examples.length} duplicate group example(s). `
      + 'Reconcile the records manually and preserve the audit trail before rerunning.',
    );
  }
}

const nonEmptyString = (field) => ({
  [field]: { $type: 'string', $ne: '' },
});

assertNoDuplicates('customers', [
  { $match: nonEmptyString('lineId') },
  { $group: { _id: '$lineId', count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } },
], 'customers.lineId');

assertNoDuplicates('users', [
  { $match: nonEmptyString('lineId') },
  { $group: { _id: '$lineId', count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } },
], 'users.lineId');

assertNoDuplicates('users', [
  { $match: nonEmptyString('email') },
  { $project: { normalized: { $toLower: { $trim: { input: '$email' } } } } },
  { $match: { normalized: { $ne: '' } } },
  { $group: { _id: '$normalized', count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } },
], 'users.email case-insensitive');

assertNoDuplicates('stores', [
  { $match: nonEmptyString('username') },
  { $project: { normalized: { $toLower: { $trim: { input: '$username' } } } } },
  { $match: { normalized: { $ne: '' } } },
  { $group: { _id: '$normalized', count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } },
], 'stores.username case-insensitive');

assertNoDuplicates('stores', [
  { $match: { ownerId: { $type: 'objectId' } } },
  { $group: { _id: '$ownerId', count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } },
], 'stores.ownerId');

assertNoDuplicates('stores', [
  { $match: { lineIds: { $type: 'array' } } },
  { $unwind: '$lineIds' },
  // The unique multikey index also indexes an empty string. Count distinct
  // documents (not duplicate array elements within one store) so preflight
  // matches MongoDB's cross-document unique-index semantics exactly.
  { $match: { lineIds: { $type: 'string' } } },
  { $group: { _id: '$lineIds', documents: { $addToSet: '$_id' } } },
  { $project: { count: { $size: '$documents' } } },
  { $match: { count: { $gt: 1 } } },
], 'stores.lineIds');

assertNoDuplicates('notifications', [
  { $match: nonEmptyString('shopNotificationId') },
  { $group: { _id: '$shopNotificationId', count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } },
], 'notifications.shopNotificationId');

assertNoDuplicates('contracts', [
  { $match: { 'item.itemId': { $type: 'objectId' } } },
  { $group: { _id: '$item.itemId', count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } },
], 'contracts.item.itemId');

db.customers.createIndex(
  { lineId: 1 },
  {
    unique: true,
    name: 'ux_customers_lineId',
    partialFilterExpression: { lineId: { $type: 'string', $gt: '' } },
  },
);
db.users.createIndex(
  { lineId: 1 },
  {
    unique: true,
    name: 'ux_users_lineId',
    partialFilterExpression: { lineId: { $type: 'string', $gt: '' } },
  },
);
db.users.createIndex(
  { email: 1 },
  {
    unique: true,
    name: 'ux_users_email_ci',
    collation: { locale: 'en', strength: 2 },
    partialFilterExpression: { email: { $type: 'string', $gt: '' } },
  },
);
db.stores.createIndex(
  { username: 1 },
  {
    unique: true,
    name: 'ux_stores_username_ci',
    collation: { locale: 'en', strength: 2 },
    partialFilterExpression: { username: { $type: 'string', $gt: '' } },
  },
);
db.stores.createIndex(
  { ownerId: 1 },
  {
    unique: true,
    name: 'ux_stores_ownerId',
    partialFilterExpression: { ownerId: { $type: 'objectId' } },
  },
);
db.stores.createIndex(
  { lineIds: 1 },
  {
    unique: true,
    name: 'ux_stores_lineIds',
    partialFilterExpression: { lineIds: { $type: 'string' } },
  },
);
db.notifications.createIndex(
  { shopNotificationId: 1 },
  {
    unique: true,
    name: 'ux_notifications_shopNotificationId',
    partialFilterExpression: { shopNotificationId: { $type: 'string', $gt: '' } },
  },
);
db.contracts.createIndex(
  { 'item.itemId': 1 },
  {
    unique: true,
    name: 'ux_contracts_itemItemId',
    partialFilterExpression: { 'item.itemId': { $type: 'objectId' } },
  },
);

db.items.createIndex(
  { lineId: 1, createdAt: -1 },
  { name: 'ix_items_owner_created' },
);
db.items.createIndex(
  { lineId: 1, status: 1, createdAt: -1 },
  { name: 'ix_items_owner_status_created' },
);
db.stores.createIndex(
  { isActive: 1, storeName: 1 },
  { name: 'ix_stores_active_name' },
);
db.notifications.createIndex(
  { lineUserId: 1, status: 1, awaitingSlipUpload: 1, updatedAt: -1 },
  { name: 'ix_notifications_slip_context' },
);

print('MongoDB hardening preflight and index creation completed successfully.');
