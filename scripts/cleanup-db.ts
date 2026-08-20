import fs from 'fs';
import path from 'path';

const DB_FILE = path.join(process.cwd(), 'db_store.json');

function cleanup() {
  if (!fs.existsSync(DB_FILE)) {
    console.log('No database file found at', DB_FILE);
    return;
  }

  console.log('Starting standalone database cleanup...');
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  let store: any;
  try {
    store = JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse db_store.json. File might be corrupted.');
    return;
  }

  let usersReset = 0;
  let txRemoved = 0;
  let roomsRemoved = 0;
  let manualRemoved = 0;

  // 1. Reset crazy win/loss counts
  if (store.users) {
    Object.values(store.users).forEach((u: any) => {
      if ((u.winCount || 0) > 200 || (u.lossCount || 0) > 200) {
        console.log(`Resetting user ${u.username} (${u.id}) with ${u.winCount} wins.`);
        u.winCount = Math.floor(Math.random() * 20) + 5;
        u.lossCount = Math.floor(Math.random() * 15) + 3;
        if (u.balance > 200) u.balance = 100.0;
        usersReset++;
      }
    });
  }

  // 2. Truncate transactions (Latest 500)
  if (Array.isArray(store.transactions) && store.transactions.length > 500) {
    const originalCount = store.transactions.length;
    // Transactions are unshifted, so newest are at the beginning
    store.transactions = store.transactions.slice(0, 500);
    txRemoved += (originalCount - store.transactions.length);
  }

  // 3. Truncate agent transactions (Latest 500)
  if (Array.isArray(store.agentTransactions) && store.agentTransactions.length > 500) {
    const originalCount = store.agentTransactions.length;
    store.agentTransactions = store.agentTransactions.slice(0, 500);
    txRemoved += (originalCount - store.agentTransactions.length);
  }

  // 4. Clear old rooms
  if (store.rooms) {
    const roomKeys = Object.keys(store.rooms);
    roomKeys.forEach(id => {
      if (store.rooms[id].status !== 'playing') {
        delete store.rooms[id];
        roomsRemoved++;
      }
    });
  }

  // 5. Clear old manual transactions
  if (Array.isArray(store.pendingManualTransactions)) {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const originalManualCount = store.pendingManualTransactions.length;
    store.pendingManualTransactions = store.pendingManualTransactions.filter((t: any) =>
      t.status === 'pending' || t.createdAt > sevenDaysAgo
    );
    manualRemoved = originalManualCount - store.pendingManualTransactions.length;
  }

  fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2), 'utf8');

  console.log('Cleanup Complete:');
  console.log(`- Users Reset: ${usersReset}`);
  console.log(`- Transactions Removed: ${txRemoved}`);
  console.log(`- Inactive Rooms Cleared: ${roomsRemoved}`);
  console.log(`- Expired Manual Transactions: ${manualRemoved}`);
  console.log('Database saved successfully.');
}

cleanup();
