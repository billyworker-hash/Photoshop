const mongoose = require('mongoose');
require('dotenv').config(); // optional: load MONGODB_URI from .env
const { Lead, Customer, Depositor } = require('./models'); // use the models export

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/yourdb'; // set your URI

const statusMap = {
    'new': 'New',
    'Hang Up': 'No Answer',
    'No Service': 'Wrong Number',
    'Call Back NOT Qualified': 'Not Interested',
    'Deposited': 'Never Invested',
    'active': 'Call Back Qualified',
    'inactive': 'Not Interested'
};

async function migrateCollection(Model, modelName) {
    for (const [oldStatus, newStatus] of Object.entries(statusMap)) {
        const count = await Model.countDocuments({ status: oldStatus });
        if (count > 0) {
            console.log(`[${modelName}] mapping "${oldStatus}" -> "${newStatus}" (${count} documents)`);
            const res = await Model.updateMany({ status: oldStatus }, { $set: { status: newStatus } });
            console.log(`[${modelName}] updated ${res.modifiedCount} documents`);
        }
    }
}

async function run() {
    console.log('Connecting to', MONGO_URI);
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    try {
        console.log('Connected. Running status migration (BACKUP your DB first!).');
        await migrateCollection(Lead, 'Lead');
        await migrateCollection(Customer, 'Customer');
        await migrateCollection(Depositor, 'Depositor');
        console.log('Migration complete.');
    } catch (err) {
        console.error('Migration error:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

run().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});