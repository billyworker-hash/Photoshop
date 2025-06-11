const mongoose = require('mongoose');

// User Schema
const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    passwordHash: String,
    role: { type: String, enum: ['admin', 'agent'], default: 'agent' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdAt: { type: Date, default: Date.now }
});

// Lead Field Schema - For dynamic custom fields
const leadFieldSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    type: {
        type: String,
        enum: ['text', 'number', 'email', 'phone', 'select', 'textarea'],
        default: 'text'
    },
    options: [String], // For select type fields
    required: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

// Lead List Schema - For managing named lists of leads
const leadListSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, default: '' },
    labels: [{
        name: String,     // Internal field name (e.g., "companySize")
        label: String,    // Display name (e.g., "Company Size")
        type: {
            type: String,
            enum: ['text', 'number', 'email', 'phone', 'select', 'textarea'],
            default: 'text'
        },
        options: [String], // For select type fields
        required: { type: Boolean, default: false }
    }],    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isActive: { type: Boolean, default: true },
    isCustomerList: { type: Boolean, default: false }, // Flag to identify customer lists
    isVisibleToUsers: { type: Boolean, default: true }, // Control whether users can see this list
    visibleToSpecificAgents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Specific agents who can see this list (optional)
    createdAt: { type: Date, default: Date.now }
});

// Lead Schema
const leadSchema = new mongoose.Schema({    status: {
        type: String,
        enum: ['new', 'No Answer', 'Voice Mail', 'Call Back Qualified', 'Call Back NOT Qualified', 'lead-released'],
        default: 'new'
    },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    customFields: { type: Map, of: mongoose.Schema.Types.Mixed }, // Dynamic fields storage
    leadList: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadList' }, // Reference to the list
    notes: [{
        content: String,
        createdAt: { type: Date, default: Date.now },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }],
    createdAt: { type: Date, default: Date.now }
});

// Customer Schema - For leads that agents have claimed
const customerSchema = new mongoose.Schema({
    fullName: String,
    email: String,
    phone: String,
    country: String,
    language: String,    status: {
        type: String,
        enum: ['new', 'No Answer', 'Voice Mail', 'Call Back Qualified', 'Call Back NOT Qualified', 'lead-released', 'active', 'inactive'],
        default: 'new'
    },
    customFields: { type: Map, of: mongoose.Schema.Types.Mixed }, // Copy of lead's custom fields
    agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // The agent who owns this customer
    originalLead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' }, // Reference to original lead
    originalLeadList: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadList' }, // Reference to original lead list for labels
    originalListName: String, // Store original list name for display
    originalListLabels: [{ // Store original list labels for display
        name: String,     // Internal field name
        label: String,    // Display name
        type: {
            type: String,
            enum: ['text', 'number', 'email', 'phone', 'select', 'textarea'],
            default: 'text'
        },
        options: [String], // For select type fields
        required: { type: Boolean, default: false }
    }],
    notes: [{
        content: String,
        createdAt: { type: Date, default: Date.now },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }],    createdAt: { type: Date, default: Date.now }
});

// Depositor Schema - For customers that have been moved to depositors
const depositorSchema = new mongoose.Schema({
    fullName: String,
    email: String,
    phone: String,
    country: String,
    language: String,    status: {
        type: String,
        enum: ['new', 'No Answer', 'Voice Mail', 'Call Back Qualified', 'Call Back NOT Qualified', 'lead-released', 'deposited', 'active', 'withdrawn', 'inactive'],
        default: 'deposited'
    },
    customFields: { type: Map, of: mongoose.Schema.Types.Mixed }, // Copy of customer's custom fields
    agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // The agent who owns this depositor
    originalCustomer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }, // Reference to original customer
    originalLead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' }, // Reference to original lead
    originalLeadList: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadList' }, // Reference to original lead list for labels
    originalListName: String, // Store original list name for display
    originalListLabels: [{ // Store original list labels for display
        name: String,     // Internal field name
        label: String,    // Display name
        type: {
            type: String,
            enum: ['text', 'number', 'email', 'phone', 'select', 'textarea'],
            default: 'text'
        },
        options: [String], // For select type fields
        required: { type: Boolean, default: false }
    }],
    notes: [{
        content: String,
        createdAt: { type: Date, default: Date.now },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }],
    createdAt: { type: Date, default: Date.now }
});

// Create and export models
const User = mongoose.model('User', userSchema);
const Lead = mongoose.model('Lead', leadSchema);
const LeadField = mongoose.model('LeadField', leadFieldSchema);
const LeadList = mongoose.model('LeadList', leadListSchema);
const Customer = mongoose.model('Customer', customerSchema);
const Depositor = mongoose.model('Depositor', depositorSchema);

module.exports = {
    User,
    Lead,
    LeadField,
    LeadList,
    Customer,
    Depositor
};
