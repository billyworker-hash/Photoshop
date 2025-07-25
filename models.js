const mongoose = require('mongoose');

// Meeting (Appointment) Subschema
const meetingSchema = new mongoose.Schema({
    title: { type: String, required: true },
    date: { type: String, required: true }, // 'YYYY-MM-DD'
    time: { type: String }, // Optional, e.g. '14:00'
    notes: { type: String },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' }, // <-- Add this line
    module: { type: String }, // Optional, e.g. 'Lead'
    createdAt: { type: Date, default: Date.now }
}, { _id: true });

// User Schema
const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    passwordHash: String,
    role: { type: String, enum: ['admin', 'agent'], default: 'agent' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    hourlyRate: { type: Number, default: 0 }, // Hourly rate in ILS
    createdAt: { type: Date, default: Date.now },
    meetings: [meetingSchema] // <-- Add this line
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
    }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Not required for system lists
    isSystem: { type: Boolean, default: false }, // Flag to identify system lists
    isActive: { type: Boolean, default: true },
    isCustomerList: { type: Boolean, default: false }, // Flag to identify customer lists
    isVisibleToUsers: { type: Boolean, default: true }, // Control whether all agents can see this list
    visibleToSpecificAgents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Specific agents who can see this list
    // Keep old field for backward compatibility
    isVisible: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

// Add custom validation for createdBy field
leadListSchema.pre('save', function (next) {
    if (!this.isSystem && !this.createdBy) {
        return next(new Error('createdBy is required for non-system lists'));
    }
    next();
});

// Lead Schema
const leadSchema = new mongoose.Schema({
    status: {
        type: String,
        enum: ['new', 'No Answer', 'Hang Up', 'Voice Mail', 'Wrong Number', 'Call Back Qualified', 'Call Back NOT Qualified', 'deposited'],
        default: 'new'
    },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    customFields: { type: Map, of: mongoose.Schema.Types.Mixed }, // Dynamic fields storage
    leadList: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadList' },
    notes: [{
        content: String,
        createdAt: { type: Date, default: Date.now },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }],
    createdAt: { type: Date, default: Date.now }
});

// Customer Schema - For leads that agents have claimed
const customerSchema = new mongoose.Schema({
    status: {
        type: String,
        enum: ['new', 'No Answer', 'Hang Up', 'Voice Mail', 'Wrong Number', 'No Service', 'Call Back Qualified', 'Call Back NOT Qualified', 'deposited', 'active', 'inactive'],
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
    }], createdAt: { type: Date, default: Date.now }
});

// Depositor Schema - For customers that have been moved to depositors
const depositorSchema = new mongoose.Schema({
    status: {
        type: String,
        enum: ['new', 'No Answer', 'Hang Up', 'Voice Mail', 'Wrong Number', 'No Service', 'Call Back Qualified', 'Call Back NOT Qualified', 'deposited', 'active', 'inactive'],
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

// Add indexes for performance
leadSchema.index({ leadList: 1, status: 1, assignedTo: 1, createdAt: -1 });
leadSchema.index({ 'customFields.fullName': 'text', 'customFields.email': 'text', 'customFields.phone': 'text' });

customerSchema.index({ originalLead: 1 });
depositorSchema.index({ originalLead: 1 });

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
