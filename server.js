// server.js
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');

const { User, Lead, LeadField, LeadList, Customer, Depositor } = require('./models');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for bulk lead uploads
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('MongoDB connected successfully');
        await ensureUsersWithNoListExists();
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1); // Exit with error if MongoDB connection fails
    });



// Helper function to ensure "Users with no list" list exists
async function ensureUsersWithNoListExists() {
    try {
        let usersWithNoList = await LeadList.findOne({ name: 'Users with no list' });
        if (!usersWithNoList) {
            usersWithNoList = new LeadList({
                name: 'Users with no list',
                description: 'Default list for users whose original lead list has been deleted',
                labels: [
                    { name: 'fullName', label: 'Full Name', type: 'text' },
                    { name: 'email', label: 'Email', type: 'email' },
                    { name: 'phone', label: 'Phone', type: 'text' },
                    { name: 'company', label: 'Company', type: 'text' }
                ],
                isSystem: true, // Mark as system list
                isVisible: true // Ensure system lists are visible by default
            });

            await usersWithNoList.save();
            console.log('Created "Users with no list" system list');
        }

        return usersWithNoList;
    } catch (error) {
        console.error('Error ensuring Users with no list:', error);
        return null;
    }
}

// Middleware to verify token
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Access token is required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
}

// Role-based access control middleware
function requireRole(role) {
    return (req, res, next) => {
        if (req.user.role !== role) {
            return res.status(403).json({ message: `${role} access required` });
        }
        next();
    };
}

// Auth Routes
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Name, email, and password are required' });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User with this email already exists' });
        }

        const hashed = await bcrypt.hash(password, 10);
        const user = new User({
            name,
            email,
            passwordHash: hashed,
            role: role || 'agent',
            status: 'active'
        });

        await user.save();

        res.status(201).json({
            message: 'User created successfully',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const user = await User.findOne({ email, status: 'active' });
        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const token = jwt.sign({
            id: user._id,
            role: user.role,
            name: user.name
        }, process.env.JWT_SECRET, { expiresIn: '24h' });

        res.json({
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Lead CRUD
app.get('/api/leads', authenticate, async (req, res) => {
    try {
        // Both admin and agent can see all leads, but only admin can upload/create
        const filter = {};
        // Add leadList filter if provided
        if (req.query.leadList) {
            filter.leadList = req.query.leadList;
        } else {
            // If no specific leadList is requested, only show leads from active lead lists
            // but exclude customer lists (owned leads)
            let leadListFilter = {
                isActive: true,
                isCustomerList: { $ne: true }
            };
            // For non-admin users, only include lists that are visible
            if (req.user.role !== 'admin') {
                leadListFilter.$or = [
                    { isVisibleToUsers: true },
                    { visibleToSpecificAgents: req.user.id }
                ];
            }
            const activeLeadLists = await LeadList.find(leadListFilter).select('_id');
            const activeListIds = activeLeadLists.map(list => list._id);
            // Include leads from active lists and exclude orphaned leads (null/undefined leadList)
            filter.leadList = { $in: activeListIds };
        }

        // Add query filters if provided
        if (req.query.status) filter.status = req.query.status;

        // --- UPDATED SEARCH LOGIC: search all fields including customFields ---
        if (req.query.search) {
            const search = req.query.search;
            const searchRegex = new RegExp(search, 'i');
            filter.$or = [
                { fullName: searchRegex },
                { email: searchRegex },
                { phone: searchRegex },
                // Search any custom field value (works for Map fields in Mongoose >= 5.1)
                {
                    $expr: {
                        $gt: [
                            {
                                $size: {
                                    $filter: {
                                        input: { $objectToArray: "$customFields" },
                                        as: "cf",
                                        cond: { $regexMatch: { input: "$$cf.v", regex: search, options: "i" } }
                                    }
                                }
                            },
                            0
                        ]
                    }
                }
            ];
        }
        // --- END UPDATED SEARCH LOGIC ---

        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Get total count for pagination info
        const totalCount = await Lead.countDocuments(filter);
        const leads = await Lead.find(filter)
            .populate('assignedTo', 'name')
            .populate('notes.createdBy', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Get leadList name for logging (if specific list requested)
        let leadListName = 'all_active';
        if (req.query.leadList) {
            try {
                const leadListDoc = await LeadList.findById(req.query.leadList).select('name');
                if (leadListDoc && leadListDoc.name) {
                    leadListName = leadListDoc.name;
                } else {
                    leadListName = req.query.leadList; // fallback to ID if not found
                }
            } catch (e) {
                leadListName = req.query.leadList; // fallback to ID if error
            }
        }
        // Log the fetch operation with user name and leadList name
        let username = 'unknown';
        if (req.user && req.user.name) {
            username = req.user.name;
        } else if (req.user && req.user.email) {
            username = req.user.email;
        }
        console.log(`[LEADS API] User: ${username} | Page: ${page} | Limit: ${limit} | Total Available: ${totalCount} | Fetched: ${leads.length} leads | Filters:`, {
            leadList: leadListName,
            search: req.query.search || 'none',
            status: req.query.status || 'all',
            source: req.query.leadList ? 'upload_section' : 'leads_section'
        });

        // Convert customFields Map to Object for each lead
        const leadsResponse = leads.map(lead => {
            const leadObj = lead.toObject();
            if (leadObj.customFields) {
                leadObj.customFields = Object.fromEntries(leadObj.customFields);
            }
            return leadObj;
        });

        // Send response with pagination metadata
        res.json({
            leads: leadsResponse,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalCount / limit),
                totalCount: totalCount,
                limit: limit,
                hasNext: page < Math.ceil(totalCount / limit),
                hasPrev: page > 1
            }
        });
    } catch (error) {
        console.error('Leads fetch error:', error);
        res.status(500).json({ message: 'Failed to fetch leads' });
    }
});

app.post('/api/leads', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const { customFields, ...leadData } = req.body;
        const lead = new Lead(leadData);

        // Handle custom fields
        if (customFields) {
            lead.customFields = new Map(Object.entries(customFields));
        }

        await lead.save();

        // Convert customFields Map to Object for JSON response
        const leadResponse = lead.toObject();
        if (leadResponse.customFields) {
            leadResponse.customFields = Object.fromEntries(leadResponse.customFields);
        }

        res.status(201).json(leadResponse);
    } catch (error) {
        console.error('Lead creation error:', error);
        res.status(500).json({ message: 'Failed to create lead' });
    }
});

app.patch('/api/leads/:id', authenticate, async (req, res) => {
    try {
        const { customFields, ...leadData } = req.body;

        const updateData = leadData;
        if (customFields) {
            updateData.customFields = new Map(Object.entries(customFields));
        }

        const lead = await Lead.findByIdAndUpdate(req.params.id, updateData, { new: true });

        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        // Convert customFields Map to Object for JSON response
        const leadResponse = lead.toObject();
        if (leadResponse.customFields) {
            leadResponse.customFields = Object.fromEntries(leadResponse.customFields);
        }

        res.json(leadResponse);
    } catch (error) {
        console.error('Lead update error:', error);
        res.status(500).json({ message: 'Failed to update lead' });
    }
});

// Add note to lead
app.post('/api/leads/:id/notes', authenticate, async (req, res) => {
    try {
        const { status, note } = req.body;

        // Find the lead
        const lead = await Lead.findById(req.params.id);
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        // Update status if provided
        if (status) {
            lead.status = status;
        }

        // Add note if provided
        if (note && note.content) {
            // If notes array doesn't exist, initialize it
            if (!lead.notes) {
                lead.notes = [];
            }
            // Add the note with current timestamp
            lead.notes.push({
                content: note.content,
                createdAt: new Date(),
                createdBy: note.createdBy || req.user.id
            });
        }
        await lead.save();

        // Populate the notes with user information
        await lead.populate('notes.createdBy', 'name');

        // Convert customFields and notes for JSON response
        const leadResponse = lead.toObject();
        if (leadResponse.customFields) {
            leadResponse.customFields = Object.fromEntries(leadResponse.customFields);
        }

        res.status(200).json(leadResponse);
    } catch (error) {
        console.error('Error adding note to lead:', error);
        res.status(500).json({ message: 'Failed to add note to lead' });
    }
});

// Delete individual lead
app.delete('/api/leads/:id', authenticate, async (req, res) => {
    try {
        // Only admins can delete leads
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const leadId = req.params.id;

        // Find the lead
        const lead = await Lead.findById(leadId);
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        // Delete the lead
        await Lead.findByIdAndDelete(leadId);

        res.status(200).json({ message: 'Lead deleted successfully' });
    } catch (error) {
        console.error('Error deleting lead:', error);
        res.status(500).json({ message: 'Failed to delete lead' });
    }
});

// Dashboard statistics
// Own Lead - Claim a lead for the current agent
app.post('/api/leads/:id/own', authenticate, async (req, res) => {
    try {        // Only agents can own leads
        if (req.user.role !== 'agent') {
            return res.status(403).json({ message: 'Only agents can own leads' });
        }
        const leadId = req.params.id;
        // Find the lead and populate its lead list
        const lead = await Lead.findById(leadId).populate('leadList');
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        // Check if the lead is already owned by someone
        if (lead.assignedTo) {
            return res.status(400).json({
                message: lead.assignedTo.toString() === req.user.id
                    ? 'You already own this lead'
                    : 'This lead is already owned by another agent'
            });
        }
        // Store original lead list information for customer record
        const originalLeadList = lead.leadList;
        const originalListName = originalLeadList ? originalLeadList.name : 'Unknown List';
        const originalListLabels = originalLeadList ? originalLeadList.labels : [];

        // Simply assign the lead to this agent (don't move it to a new list)
        lead.assignedTo = req.user.id;        // Add a note about lead ownership
        if (!lead.notes) {
            lead.notes = [];
        }
        lead.notes.push({
            content: `Lead claimed`,
            createdAt: new Date(),
            createdBy: req.user.id
        });

        // Create a new Customer record from this lead - copy exact schema info
        const newCustomer = new Customer({
            fullName: lead.customFields?.get('fullName') || lead.fullName || '',
            email: lead.customFields?.get('email') || lead.email || '',
            phone: lead.customFields?.get('phone') || lead.phone || '',
            country: lead.customFields?.get('country') || lead.country || '',
            language: lead.customFields?.get('language') || lead.language || '',
            status: lead.status || 'new', // Copy the lead's current status
            customFields: lead.customFields || new Map(),
            agent: req.user.id,
            originalLead: lead._id,
            originalLeadList: originalLeadList ? originalLeadList._id : null,
            originalListName: originalListName,
            originalListLabels: originalListLabels,
            notes: [
                // Copy existing notes from lead (including the new "claimed by" note)
                ...(lead.notes || []).map(note => ({
                    content: note.content,
                    createdAt: note.createdAt,
                    createdBy: note.createdBy
                }))
                // Removed duplicate note creation - only keep the "claimed by" note
            ]
        });        // Save the lead (now marked as assigned to the agent)
        await lead.save();

        // Populate the notes with user information
        await lead.populate('notes.createdBy', 'name');

        // Save the new customer (this creates a customer record for the agent's management)
        await newCustomer.save();

        // Populate the customer notes with user information
        await newCustomer.populate('notes.createdBy', 'name');

        // Convert customer customFields for response
        const customerResponse = newCustomer.toObject();
        if (customerResponse.customFields) {
            customerResponse.customFields = Object.fromEntries(customerResponse.customFields);
        }

        // Also convert lead customFields for response
        const leadResponse = lead.toObject();
        if (leadResponse.customFields) {
            leadResponse.customFields = Object.fromEntries(leadResponse.customFields);
        }
        res.status(200).json({
            lead: leadResponse,
            customer: customerResponse,
            message: 'Lead successfully owned and customer record created'
        });
    } catch (error) {
        console.error('Error owning lead:', error);
        res.status(500).json({ message: 'Failed to own lead' });
    }
});

// Give back (release) an owned lead back to the general pool
app.post('/api/leads/:id/release', authenticate, async (req, res) => {
    try {        // Only agents can release leads
        if (req.user.role !== 'agent') {
            return res.status(403).json({ message: 'Only agents can release leads' });
        }

        const leadId = req.params.id;

        // Find the lead
        const lead = await Lead.findById(leadId).populate('assignedTo');
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        // Check if the lead is owned
        if (!lead.assignedTo) {
            return res.status(400).json({ message: 'This lead is not currently owned' });
        }        // Check if the user can release this lead (must be the owner)
        if (lead.assignedTo._id.toString() !== req.user.id) {
            return res.status(403).json({ message: 'You can only release your own leads' });
        }

        // Store the agent name for the note
        const previousOwnerName = lead.assignedTo.name;

        // Release the lead (remove assignedTo)
        lead.assignedTo = null;

        // Add a note about lead release
        if (!lead.notes) {
            lead.notes = [];
        }

        lead.notes.push({
            content: `Lead released back to general pool by ${previousOwnerName}`,
            createdAt: new Date(),
            createdBy: req.user.id
        });

        // Save the lead
        await lead.save();

        // Optionally: Keep the customer record but mark it as inactive or add a note
        // Find and update the customer record if it exists
        const customer = await Customer.findOne({ originalLead: leadId });
        if (customer) {
            // Add a note to the customer record
            if (!customer.notes) {
                customer.notes = [];
            }

            customer.notes.push({
                content: `Original lead was released back to general pool`,
                createdAt: new Date(),
                createdBy: req.user.id
            });

            await customer.save();
        }

        // Convert lead customFields for response
        const leadResponse = lead.toObject();
        if (leadResponse.customFields) {
            leadResponse.customFields = Object.fromEntries(leadResponse.customFields);
        }

        res.status(200).json({
            lead: leadResponse,
            message: `Lead successfully released back to general pool`
        });
    } catch (error) {
        console.error('Error releasing lead:', error);
        res.status(500).json({ message: 'Failed to release lead' });
    }
});

// Take over a lead from another agent
app.post('/api/leads/:id/take-over', authenticate, async (req, res) => {
    try {
        // Only agents can take over leads
        if (req.user.role !== 'agent') {
            return res.status(403).json({ message: 'Only agents can take over leads' });
        }

        const leadId = req.params.id;

        // Find the lead and populate its current owner and lead list
        const lead = await Lead.findById(leadId).populate('assignedTo').populate('leadList');
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        // Check if the lead is currently owned by someone
        if (!lead.assignedTo) {
            return res.status(400).json({ message: 'This lead is not currently owned by anyone' });
        }

        // Check if the user is trying to take over their own lead
        if (lead.assignedTo._id.toString() === req.user.id) {
            return res.status(400).json({ message: 'You already own this lead' });
        }

        // Store the previous owner's name for the note
        const previousOwnerName = lead.assignedTo.name;
        const previousOwnerId = lead.assignedTo._id;

        // Store original lead list information for potential customer record updates
        const originalLeadList = lead.leadList;
        const originalListName = originalLeadList ? originalLeadList.name : 'Unknown List';
        const originalListLabels = originalLeadList ? originalLeadList.labels : [];

        // Transfer ownership to the current user
        lead.assignedTo = req.user.id;

        // Add a note about the lead takeover
        if (!lead.notes) {
            lead.notes = [];
        }
        lead.notes.push({
            content: `Lead taken over from ${previousOwnerName}`,
            createdAt: new Date(),
            createdBy: req.user.id
        });

        // Save the lead with new ownership
        await lead.save();

        // Handle customer records - find the existing customer record for the previous owner
        const existingCustomer = await Customer.findOne({ originalLead: leadId, agent: previousOwnerId });

        if (existingCustomer) {
            // Update the existing customer record to reflect the new agent
            existingCustomer.agent = req.user.id;

            // Add a note to the customer record about the takeover
            if (!existingCustomer.notes) {
                existingCustomer.notes = [];
            }
            existingCustomer.notes.push({
                content: `Lead taken over from ${previousOwnerName}`,
                createdAt: new Date(),
                createdBy: req.user.id
            });

            // Copy any new notes from the lead to the customer record
            const leadNotes = lead.notes || [];
            const lastCustomerNoteTime = existingCustomer.notes.length > 0
                ? Math.max(...existingCustomer.notes.map(n => new Date(n.createdAt).getTime()))
                : 0;

            leadNotes.forEach(note => {
                const noteTime = new Date(note.createdAt).getTime();
                if (noteTime > lastCustomerNoteTime) {
                    existingCustomer.notes.push({
                        content: note.content,
                        createdAt: note.createdAt,
                        createdBy: note.createdBy
                    });
                }
            });

            await existingCustomer.save();
        } else {
            // If no existing customer record, create a new one for the new owner
            const newCustomer = new Customer({
                fullName: lead.customFields?.get('fullName') || lead.fullName || '',
                email: lead.customFields?.get('email') || lead.email || '',
                phone: lead.customFields?.get('phone') || lead.phone || '',
                country: lead.customFields?.get('country') || lead.country || '',
                language: lead.customFields?.get('language') || lead.language || '',
                status: lead.status || 'new',
                customFields: lead.customFields || new Map(),
                agent: req.user.id,
                originalLead: lead._id,
                originalLeadList: originalLeadList ? originalLeadList._id : null,
                originalListName: originalListName,
                originalListLabels: originalListLabels,
                notes: [
                    // Copy all notes from lead
                    ...(lead.notes || []).map(note => ({
                        content: note.content,
                        createdAt: note.createdAt,
                        createdBy: note.createdBy
                    }))
                ]
            });

            await newCustomer.save();
        }

        // Populate the lead notes with user information for response
        await lead.populate('notes.createdBy', 'name');

        // Convert lead customFields for response
        const leadResponse = lead.toObject();
        if (leadResponse.customFields) {
            leadResponse.customFields = Object.fromEntries(leadResponse.customFields);
        }

        res.status(200).json({
            lead: leadResponse,
            message: `Lead successfully taken over from ${previousOwnerName}`
        });

    } catch (error) {
        console.error('Error taking over lead:', error);
        res.status(500).json({ message: 'Failed to take over lead' });
    }
});

app.get('/api/dashboard/stats', authenticate, async (req, res) => {
    try {
        const filter = req.user.role === 'agent' ? { assignedTo: req.user.id } : {};

        console.log(`[DASHBOARD STATS] User: ${req.user.username} | Role: ${req.user.role} | Using aggregation for efficient dashboard stats`);

        // Use aggregation to get total count efficiently
        const totalCountResult = await Lead.aggregate([
            { $match: filter },
            { $count: "totalLeads" }
        ]);
        const totalLeads = totalCountResult.length > 0 ? totalCountResult[0].totalLeads : 0;

        // Use aggregation to get status breakdown efficiently
        const statusBreakdown = await Lead.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 }
                }
            }
        ]);

        // Convert status breakdown to the expected format
        const statusCounts = {
            new: 0,
            'No Answer': 0,
            'Voice Mail': 0,
            'Call Back Qualified': 0,
            'Call Back NOT Qualified': 0
        };

        statusBreakdown.forEach(item => {
            if (statusCounts.hasOwnProperty(item._id)) {
                statusCounts[item._id] = item.count;
            }
        });

        // Get monthly trends using aggregation
        const now = new Date();
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(now.getMonth() - 5);

        const monthlyTrends = await Lead.aggregate([
            {
                $match: {
                    ...filter,
                    createdAt: { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        console.log(`[DASHBOARD STATS] User: ${req.user.username} | Total: ${totalLeads} leads | Efficient aggregation used`);

        res.json({
            totalLeads,
            statusBreakdown: statusCounts,
            monthlyTrends
        });
    } catch (err) {
        console.error('Dashboard stats error:', err);
        res.status(500).json({ message: 'Error fetching dashboard statistics' });
    }
});

// User Management Routes (Admin only)
app.get('/api/users', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const query = req.query.role ? { role: req.query.role } : {};
        const users = await User.find(query).select('-passwordHash');
        res.json(users);
    } catch (error) {
        console.error('Users fetch error:', error);
        res.status(500).json({ message: 'Failed to fetch users' });
    }
});

app.patch('/api/users/:id', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true }).select('-passwordHash');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(user);
    } catch (error) {
        console.error('User update error:', error);
        res.status(500).json({ message: 'Failed to update user' });
    }
});

// Full user update endpoint (PUT)
app.put('/api/users/:id', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const { name, email, password, role } = req.body;

        if (!name || !email) {
            return res.status(400).json({ message: 'Name and email are required' });
        }

        const updateData = { name, email, role };

        // If password is provided, hash it and include in update
        if (password) {
            const bcrypt = require('bcryptjs');
            updateData.passwordHash = await bcrypt.hash(password, 10);
        }

        const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-passwordHash');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(user);
    } catch (error) {
        console.error('User update error:', error);
        res.status(500).json({ message: 'Failed to update user' });
    }
});

// Delete user endpoint
app.delete('/api/users/:id', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }

        // Prevent deletion of own account
        if (req.params.id === req.user.id) {
            return res.status(400).json({ message: 'Cannot delete your own account' });
        }

        const user = await User.findByIdAndDelete(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('User deletion error:', error);
        res.status(500).json({ message: 'Failed to delete user' });
    }
});

// Deactivate all users endpoint (Admin only)
app.post('/api/users/deactivate-all', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }

        // Deactivate all users except the current admin
        const result = await User.updateMany(
            {
                _id: { $ne: req.user.id }, // Exclude current user
                status: 'active' // Only update active users
            },
            {
                status: 'inactive',
                updatedAt: new Date()
            }
        );

        console.log(`Admin ${req.user.email} deactivated ${result.modifiedCount} users`);

        res.json({
            message: `Successfully deactivated ${result.modifiedCount} user(s)`,
            deactivatedCount: result.modifiedCount
        });
    } catch (error) {
        console.error('Bulk user deactivation error:', error);
        res.status(500).json({ message: 'Failed to deactivate users' });
    }
});

// Lead Field Management Routes (Admin only)
app.get('/api/lead-fields', authenticate, async (req, res) => {
    try {
        const fields = await LeadField.find({ isActive: true }).sort({ order: 1 });
        res.json(fields);
    } catch (error) {
        console.error('Lead fields fetch error:', error);
        res.status(500).json({ message: 'Failed to fetch lead fields' });
    }
});

app.post('/api/lead-fields', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const { name, label, type, options, required, order } = req.body;

        if (!name || !label) {
            return res.status(400).json({ message: 'Name and label are required' });
        }

        const field = new LeadField({
            name,
            label,
            type: type || 'text',
            options: options || [],
            required: required || false,
            order: order || 0
        });

        await field.save();
        res.status(201).json(field);
    } catch (error) {
        console.error('Lead field creation error:', error);
        if (error.code === 11000) {
            res.status(400).json({ message: 'Field name already exists' });
        } else {
            res.status(500).json({ message: 'Failed to create lead field' });
        }
    }
});

app.put('/api/lead-fields/:id', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const field = await LeadField.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!field) {
            return res.status(404).json({ message: 'Field not found' });
        }

        res.json(field);
    } catch (error) {
        console.error('Lead field update error:', error);
        res.status(500).json({ message: 'Failed to update lead field' });
    }
});

app.delete('/api/lead-fields/:id', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }

        // Soft delete by setting isActive to false
        const field = await LeadField.findByIdAndUpdate(
            req.params.id,
            { isActive: false },
            { new: true }
        );

        if (!field) {
            return res.status(404).json({ message: 'Field not found' });
        }

        res.json({ message: 'Field deleted successfully' });
    } catch (error) {
        console.error('Lead field deletion error:', error);
        res.status(500).json({ message: 'Failed to delete lead field' });
    }
});

// Lead List Management Routes (Admin only)
app.get('/api/lead-lists', authenticate, async (req, res) => {
    try {
        let filter = { isActive: true };

        // Allow filtering by isCustomerList
        if (req.query.isCustomerList !== undefined) {
            filter.isCustomerList = req.query.isCustomerList === 'true';
        }

        // For non-admin users, filter based on visibility settings
        if (req.user.role !== 'admin') {
            filter.$or = [
                { isVisibleToUsers: true },
                { visibleToSpecificAgents: req.user.id }
            ];
        } const lists = await LeadList.find(filter)
            .populate('createdBy', 'name email')
            .populate('visibleToSpecificAgents', 'name email')
            .sort({ createdAt: -1 });
        console.log(`[LEAD-LISTS API] User: ${req.user.username} (${req.user.role}) | Found ${lists.length} lists | Using aggregation for efficient counting...`);

        // Get all lead counts in a single aggregation query - OPTIMIZED!
        const leadCounts = await Lead.aggregate([
            {
                $group: {
                    _id: '$leadList',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Create a map for O(1) lookup of counts
        const countMap = new Map();
        leadCounts.forEach(item => {
            if (item._id) {
                countMap.set(item._id.toString(), item.count);
            }
        });

        // Add counts to lists
        const listsWithCounts = lists.map(list => {
            const listObj = list.toObject();
            listObj.leadCount = countMap.get(list._id.toString()) || 0;
            return listObj;
        });

        console.log(`[LEAD-LISTS API] User: ${req.user.username} | Optimized: 1 aggregation query instead of ${lists.length} separate queries`);

        res.json(listsWithCounts);
    } catch (error) {
        console.error('Lead lists fetch error:', error);
        res.status(500).json({ message: 'Failed to fetch lead lists' });
    }
});

app.post('/api/lead-lists', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const { name, description, labels, isVisibleToUsers, visibleToSpecificAgents } = req.body;

        if (!name) {
            return res.status(400).json({ message: 'List name is required' });
        }

        const leadList = new LeadList({
            name,
            description: description || '',
            labels: labels || [],
            isVisibleToUsers: isVisibleToUsers !== undefined ? isVisibleToUsers : true,
            visibleToSpecificAgents: visibleToSpecificAgents || [],
            createdBy: req.user.id
        });

        await leadList.save();
        await leadList.populate('createdBy', 'name email');

        res.status(201).json(leadList);
    } catch (error) {
        console.error('Lead list creation error:', error);
        res.status(500).json({ message: 'Failed to create lead list' });
    }
});

// Get specific lead list by ID
app.get('/api/lead-lists/:id', authenticate, async (req, res) => {
    try {
        const leadList = await LeadList.findById(req.params.id)
            .populate('createdBy', 'name email')
            .populate('visibleToSpecificAgents', 'name email');

        if (!leadList || !leadList.isActive) {
            return res.status(404).json({ message: 'Lead list not found' });
        }

        res.json(leadList);
    } catch (error) {
        console.error('Lead list fetch error:', error);
        res.status(500).json({ message: 'Failed to fetch lead list' });
    }
});

app.put('/api/lead-lists/:id', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }
        const leadList = await LeadList.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        ).populate('createdBy', 'name email')
            .populate('visibleToSpecificAgents', 'name email');

        if (!leadList) {
            return res.status(404).json({ message: 'Lead list not found' });
        }

        res.json(leadList);
    } catch (error) {
        console.error('Lead list update error:', error);
        res.status(500).json({ message: 'Failed to update lead list' });
    }
});

app.delete('/api/lead-lists/:id', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }

        // Check if the lead list exists
        const leadList = await LeadList.findById(req.params.id);
        if (!leadList) {
            return res.status(404).json({ message: 'Lead list not found' });
        }

        const { hard } = req.query; // Check if hard delete is requested

        if (hard === 'true') {
            // Hard delete: remove the list and all associated leads
            // Delete all leads associated with this list
            await Lead.deleteMany({ leadList: req.params.id });

            // Delete the list itself
            await LeadList.findByIdAndDelete(req.params.id);

            res.json({ message: 'Lead list and associated leads deleted permanently' });
        } else {
            // Soft delete by setting isActive to false
            const updatedList = await LeadList.findByIdAndUpdate(
                req.params.id,
                { isActive: false },
                { new: true }
            );

            res.json({ message: 'Lead list deleted successfully' });
        }
    } catch (error) {
        console.error('Lead list deletion error:', error);
        res.status(500).json({ message: 'Failed to delete lead list' });
    }
});

// Bulk add leads to a specific list
app.post('/api/lead-lists/:id/bulk-leads', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const { leads } = req.body;
        const listId = req.params.id;

        if (!leads || !Array.isArray(leads)) {
            return res.status(400).json({ message: 'Leads array is required' });
        }

        // Verify the list exists
        const leadList = await LeadList.findById(listId);
        if (!leadList) {
            return res.status(404).json({ message: 'Lead list not found' });
        }

        // Add leadList reference to each lead
        const leadsWithList = leads.map(lead => ({
            ...lead,
            leadList: listId,
            status: lead.status || 'new'
        }));

        // Process leads in batches to avoid memory issues with large datasets
        const BATCH_SIZE = 100;
        let totalInserted = 0;
        const insertedLeads = [];

        for (let i = 0; i < leadsWithList.length; i += BATCH_SIZE) {
            const batch = leadsWithList.slice(i, i + BATCH_SIZE);
            console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(leadsWithList.length / BATCH_SIZE)} (${batch.length} leads)`);

            try {
                const batchResult = await Lead.insertMany(batch);
                insertedLeads.push(...batchResult);
                totalInserted += batchResult.length;
            } catch (batchError) {
                console.error(`Error in batch ${Math.floor(i / BATCH_SIZE) + 1}:`, batchError);
                // Continue with next batch instead of failing completely
            }
        }

        console.log(`Bulk insert completed: ${totalInserted}/${leadsWithList.length} leads inserted successfully`);

        res.json({
            message: `Leads added successfully: ${totalInserted}/${leadsWithList.length} inserted`,
            inserted: totalInserted,
            total: leadsWithList.length,
            leads: insertedLeads.slice(0, 10) // Return only first 10 for response size optimization
        });
    } catch (error) {
        console.error('Bulk leads creation error:', error);
        res.status(500).json({ message: 'Failed to add leads' });
    }
});

// Customer Management Routes
app.get('/api/customers', authenticate, async (req, res) => {
    try {
        // For agents, show only their customers
        // For admins, show all customers if no filter specified
        const filter = req.user.role === 'agent' ? { agent: req.user.id } : {};

        // Apply additional filters if provided
        if (req.query.agent) filter.agent = req.query.agent;
        if (req.query.status) filter.status = req.query.status;
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            filter.$or = [
                { fullName: searchRegex },
                { email: searchRegex },
                { phone: searchRegex }
            ];
        }

        const customers = await Customer.find(filter)
            .populate('notes.createdBy', 'name')
            .sort({ createdAt: -1 });

        // Convert customFields Map to Object for each customer
        const customersResponse = customers.map(customer => {
            const customerObj = customer.toObject();
            if (customerObj.customFields) {
                customerObj.customFields = Object.fromEntries(customerObj.customFields);
            }
            return customerObj;
        });

        res.json(customersResponse);
    } catch (error) {
        console.error('Customers fetch error:', error);
        res.status(500).json({ message: 'Failed to fetch customers' });
    }
});

// Add note to a customer
app.post('/api/customers/:id/notes', authenticate, async (req, res) => {
    try {
        const { status, note } = req.body;

        // Find the customer
        const customer = await Customer.findById(req.params.id);
        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        // Check if customer belongs to the current user (agents only)
        if (req.user.role === 'agent' && customer.agent.toString() !== req.user.id) {
            return res.status(403).json({ message: 'You can only update your own customers' });
        }

        // Update status if provided
        if (status) {
            customer.status = status;
        }

        // Add note if provided
        if (note && note.content) {
            // If notes array doesn't exist, initialize it
            if (!customer.notes) {
                customer.notes = [];
            }

            // Add the note with current timestamp
            const newNote = {
                content: note.content,
                createdAt: new Date(),
                createdBy: note.createdBy || req.user.id
            };
            customer.notes.push(newNote);

            // --- SYNC NOTE TO ORIGINAL LEAD IF EXISTS ---
            if (customer.originalLead) {
                const lead = await Lead.findById(customer.originalLead);
                if (lead) {
                    if (!lead.notes) lead.notes = [];
                    lead.notes.push({
                        content: newNote.content,
                        createdAt: newNote.createdAt,
                        createdBy: newNote.createdBy
                    });
                    await lead.save();
                }
            }
            // --- END SYNC ---
        }
        await customer.save();

        // Populate the notes with user information
        await customer.populate('notes.createdBy', 'name');

        // Convert customFields for JSON response
        const customerResponse = customer.toObject();
        if (customerResponse.customFields) {
            customerResponse.customFields = Object.fromEntries(customerResponse.customFields);
        }

        res.status(200).json(customerResponse);
    } catch (error) {
        console.error('Error adding note to customer:', error);
        res.status(500).json({ message: 'Failed to add note to customer' });
    }
});

// Release Customer - Convert customer back to lead
app.post('/api/customers/:id/release', authenticate, async (req, res) => {
    try {
        // Only agents and admins can release customers
        if (req.user.role !== 'agent' && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Only agents can release customers' });
        }

        const customerId = req.params.id;

        // Find the customer
        const customer = await Customer.findById(customerId);
        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        // Check if customer belongs to the current user (agents only)
        if (req.user.role === 'agent' && customer.agent.toString() !== req.user.id) {
            return res.status(403).json({ message: 'You can only release your own customers' });
        }

        // Find the original lead to restore it
        let originalLead = null;
        if (customer.originalLead) {
            originalLead = await Lead.findById(customer.originalLead);
        }

        // Determine which lead list to use
        let targetLeadList = null;
        let targetListName = 'General Pool';

        if (customer.originalLeadList) {
            // Try to use the original lead list
            const originalLeadList = await LeadList.findById(customer.originalLeadList);
            if (originalLeadList && originalLeadList.isActive) {
                targetLeadList = originalLeadList;
                targetListName = originalLeadList.name;
            }
        }        // If no original list or it's inactive, use the "Users with no list" list
        if (!targetLeadList) {
            const defaultList = await ensureUsersWithNoListExists();
            if (!defaultList) {
                return res.status(500).json({ message: 'Failed to create Users with no list' });
            }

            targetLeadList = defaultList;
            targetListName = defaultList.name;
        }

        let newLead;

        if (originalLead) {
            // Restore the original lead
            originalLead.assignedTo = null; // Release it to general pool
            originalLead.status = customer.status || 'new';

            // Add note about customer release
            if (!originalLead.notes) {
                originalLead.notes = [];
            }
            // Replace the lead's notes array with customer notes plus release note
            originalLead.notes = [
                ...(customer.notes || []).map(note => ({
                    content: note.content,
                    createdAt: note.createdAt,
                    createdBy: note.createdBy
                })),
                {
                    content: `Customer released back to leads pool. Returned to "${targetListName}" list.`,
                    createdAt: new Date(),
                    createdBy: req.user.id
                }
            ];

            // Update lead list reference if it changed
            originalLead.leadList = targetLeadList._id;

            await originalLead.save();
            newLead = originalLead;
        } else {            // Create a new lead from customer data
            newLead = new Lead({
                status: customer.status || 'new',
                assignedTo: null, // Released to general pool
                customFields: customer.customFields || new Map(),
                leadList: targetLeadList._id,
                notes: [{
                    content: `Lead recreated from customer release. Added to "${targetListName}" list.`,
                    createdAt: new Date(),
                    createdBy: req.user.id
                },
                // Copy only customer notes that were created AFTER the customer was created
                // to avoid duplicating notes that were originally copied from the lead
                ...(customer.notes ? customer.notes.filter(note =>
                    new Date(note.createdAt) >= customer.createdAt
                ).map(note => ({
                    content: note.content,
                    createdAt: note.createdAt,
                    createdBy: note.createdBy
                })) : [])
                ]
            });

            await newLead.save();
        }

        // Delete the customer record
        await Customer.findByIdAndDelete(customerId);

        // Convert lead customFields for response
        const leadResponse = newLead.toObject();
        if (leadResponse.customFields) {
            leadResponse.customFields = Object.fromEntries(leadResponse.customFields);
        } res.status(200).json({
            lead: leadResponse,
            targetList: targetListName,
            message: `Customer successfully released back to leads pool in "${targetListName}" list`
        });
    } catch (error) {
        console.error('Error releasing customer:', error);
        res.status(500).json({ message: 'Failed to release customer' });
    }
});

// Move Customer to Depositors - Convert customer to depositor
app.post('/api/customers/:id/move-to-depositors', authenticate, async (req, res) => {
    try {
        // Only agents and admins can move customers to depositors
        if (req.user.role !== 'agent' && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Only agents can move customers to depositors' });
        }

        const customerId = req.params.id;

        // Find the customer
        const customer = await Customer.findById(customerId);
        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        // Check if customer belongs to the current user (agents only)
        if (req.user.role === 'agent' && customer.agent.toString() !== req.user.id) {
            return res.status(403).json({ message: 'You can only move your own customers to depositors' });
        }        // Create new depositor from customer data
        const newDepositor = new Depositor({
            fullName: customer.fullName,
            email: customer.email,
            phone: customer.phone,
            country: customer.country,
            language: customer.language,
            status: customer.status, // Preserve original status
            customFields: customer.customFields || new Map(),
            agent: customer.agent, // Keep the same agent
            originalCustomer: customer._id, // Reference to original customer
            originalLead: customer.originalLead, // Reference to original lead
            originalLeadList: customer.originalLeadList, // Reference to original lead list
            originalListName: customer.originalListName, // Store original list name
            originalListLabels: customer.originalListLabels, // Store original list labels
            notes: [
                ...(customer.notes || []).map(note => ({
                    content: note.content,
                    createdAt: note.createdAt,
                    createdBy: note.createdBy
                })),
                {
                    content: 'Customer moved to depositors list.',
                    createdAt: new Date(),
                    createdBy: req.user.id
                }
            ]
        });

        await newDepositor.save();

        // Delete the customer record
        await Customer.findByIdAndDelete(customerId);

        // Convert depositor customFields for response
        const depositorResponse = newDepositor.toObject();
        if (depositorResponse.customFields) {
            depositorResponse.customFields = Object.fromEntries(depositorResponse.customFields);
        }

        res.status(200).json({
            depositor: depositorResponse,
            message: 'Customer successfully moved to depositors list'
        });
    } catch (error) {
        console.error('Error moving customer to depositors:', error);
        res.status(500).json({ message: 'Failed to move customer to depositors' });
    }
});

// ========================================
// DEPOSITOR ROUTES
// ========================================

// Get all depositors with filtering and pagination
app.get('/api/depositors', authenticate, async (req, res) => {
    try {
        const { page = 1, limit = 20, status, agentId, search } = req.query;

        // Build filter object
        const filter = {};
        // Role-based filtering
        if (req.user.role === 'agent') {
            filter.agent = req.user.id;
        } else if (agentId && req.user.role === 'admin') {
            filter.agent = agentId;
        }

        // Status filtering
        if (status) {
            filter.status = status;
        }
        // Search filtering
        if (search) {
            filter.$or = [
                { fullName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
                { company: { $regex: search, $options: 'i' } }
            ];
        } const depositors = await Depositor.find(filter)
            .populate('agent', 'name email')
            .populate('notes.createdBy', 'name')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        // Get total count for pagination
        const total = await Depositor.countDocuments(filter);

        // Convert customFields for response
        const depositorsResponse = depositors.map(depositor => {
            const depositorObj = depositor.toObject();
            if (depositorObj.customFields) {
                depositorObj.customFields = Object.fromEntries(depositorObj.customFields);
            }
            return depositorObj;
        });

        res.status(200).json({
            depositors: depositorsResponse,
            pagination: {
                current: parseInt(page),
                pages: Math.ceil(total / limit),
                total: total
            }
        });
    } catch (error) {
        console.error('Error fetching depositors:', error);
        res.status(500).json({ message: 'Failed to fetch depositors' });
    }
});

// Get a single depositor by ID
app.get('/api/depositors/:id', authenticate, async (req, res) => {
    try {
        const depositor = await Depositor.findById(req.params.id)
            .populate('agent', 'name email')
            .populate('notes.createdBy', 'name');

        if (!depositor) {
            return res.status(404).json({ message: 'Depositor not found' });
        }
        // Check permissions - agents can only view their own depositors
        if (req.user.role === 'agent' && depositor.agent._id.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Access denied' });
        }

        // Convert customFields for response
        const depositorResponse = depositor.toObject();
        if (depositorResponse.customFields) {
            depositorResponse.customFields = Object.fromEntries(depositorResponse.customFields);
        }

        res.status(200).json({ depositor: depositorResponse });
    } catch (error) {
        console.error('Error fetching depositor:', error);
        res.status(500).json({ message: 'Failed to fetch depositor' });
    }
});

// Add note to depositor
app.post('/api/depositors/:id/notes', authenticate, async (req, res) => {
    try {
        const { status, note } = req.body;

        const depositor = await Depositor.findById(req.params.id);
        if (!depositor) {
            return res.status(404).json({ message: 'Depositor not found' });
        }
        // Check permissions - agents can only add notes to their own depositors
        if (req.user.role === 'agent' && depositor.agent.toString() !== req.user.id) {
            return res.status(403).json({ message: 'You can only add notes to your own depositors' });
        }

        // Update status if provided
        if (status) {
            depositor.status = status;
        }

        // Add note if provided
        if (note && note.content) {
            // If notes array doesn't exist, initialize it
            if (!depositor.notes) {
                depositor.notes = [];
            }

            // Add the note with current timestamp
            const newNote = {
                content: note.content,
                createdAt: new Date(),
                createdBy: note.createdBy || req.user._id
            };
            depositor.notes.push(newNote);

            // --- SYNC NOTE TO ORIGINAL LEAD IF EXISTS ---
            if (depositor.originalLead) {
                const lead = await Lead.findById(depositor.originalLead);
                if (lead) {
                    if (!lead.notes) lead.notes = [];
                    lead.notes.push({
                        content: newNote.content,
                        createdAt: newNote.createdAt,
                        createdBy: newNote.createdBy
                    });
                    await lead.save();
                }
            }
            // --- END SYNC ---
        }
        await depositor.save();

        // Populate the depositor with agent and notes user info for response
        await depositor.populate('agent', 'name email');
        await depositor.populate('notes.createdBy', 'name');

        // Convert customFields for response
        const depositorResponse = depositor.toObject();
        if (depositorResponse.customFields) {
            depositorResponse.customFields = Object.fromEntries(depositorResponse.customFields);
        }

        res.status(200).json(depositorResponse);
    } catch (error) {
        console.error('Error adding note to depositor:', error);
        res.status(500).json({ message: 'Failed to add note' });
    }
});

// Update depositor status
app.patch('/api/depositors/:id/status', authenticate, async (req, res) => {
    try {
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ message: 'Status is required' });
        }
        const validStatuses = ['new', 'No Answer', 'Voice Mail', 'Call Back Qualified', 'Call Back NOT Qualified', 'deposited', 'active', 'withdrawn', 'inactive'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const depositor = await Depositor.findById(req.params.id); if (!depositor) {
            return res.status(404).json({ message: 'Depositor not found' });
        }

        // Check permissions - agents can only update their own depositors
        if (req.user.role === 'agent' && depositor.agent.toString() !== req.user.id) {
            return res.status(403).json({ message: 'You can only update your own depositors' });
        }

        const oldStatus = depositor.status;
        depositor.status = status;

        // Add a note about the status change
        if (!depositor.notes) {
            depositor.notes = [];
        }

        depositor.notes.push({
            content: `Status changed from "${oldStatus}" to "${status}" by ${req.user.name}`,
            createdAt: new Date(),
            createdBy: req.user.id
        });

        await depositor.save();

        // Populate the depositor with agent info for response
        await depositor.populate('agent', 'name email');

        // Convert customFields for response
        const depositorResponse = depositor.toObject();
        if (depositorResponse.customFields) {
            depositorResponse.customFields = Object.fromEntries(depositorResponse.customFields);
        }

        res.status(200).json({
            depositor: depositorResponse,
            message: 'Status updated successfully'
        });
    } catch (error) {
        console.error('Error updating depositor status:', error);
        res.status(500).json({ message: 'Failed to update status' });
    }
});

// Delete depositor (Admin only)
app.delete('/api/depositors/:id', authenticate, async (req, res) => {
    try {
        // Only admins can delete depositors
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Only admins can delete depositors' });
        }

        const depositor = await Depositor.findById(req.params.id);
        if (!depositor) {
            return res.status(404).json({ message: 'Depositor not found' });
        }

        await Depositor.findByIdAndDelete(req.params.id);

        res.status(200).json({ message: 'Depositor deleted successfully' });
    } catch (error) {
        console.error('Error deleting depositor:', error);
        res.status(500).json({ message: 'Failed to delete depositor' });
    }
});

// Release depositor back to customers (Hierarchy system)
app.post('/api/depositors/:id/release-to-customers', authenticate, async (req, res) => {
    try {
        // Only agents can release their own depositors
        if (req.user.role !== 'agent') {
            return res.status(403).json({ message: 'Only agents can release depositors' });
        }

        const depositor = await Depositor.findById(req.params.id);
        if (!depositor) {
            return res.status(404).json({ message: 'Depositor not found' });
        }

        // Check permissions - agents can only release their own depositors
        if (depositor.agent.toString() !== req.user.id) {
            return res.status(403).json({ message: 'You can only release your own depositors' });
        }
        // Create new customer from depositor data
        const newCustomer = new Customer({
            fullName: depositor.fullName,
            email: depositor.email,
            phone: depositor.phone,
            country: depositor.country,
            language: depositor.language,
            company: depositor.company,
            status: depositor.status, // Preserve original status
            customFields: depositor.customFields,
            agent: depositor.agent, // Use correct field name
            originalLead: depositor.originalLead,
            originalLeadList: depositor.originalLeadList,
            originalListName: depositor.originalListName,
            originalListLabels: depositor.originalListLabels, notes: [
                ...(depositor.notes || []).map(note => ({
                    content: note.content,
                    createdAt: note.createdAt,
                    createdBy: note.createdBy
                })),
                {
                    content: `Released from depositors list back to customers by ${req.user.name}`,
                    createdAt: new Date(),
                    createdBy: req.user.id
                }
            ]
        });

        await newCustomer.save();

        // Delete the depositor record
        await Depositor.findByIdAndDelete(req.params.id);

        // Convert customer customFields for response
        const customerResponse = newCustomer.toObject();
        if (customerResponse.customFields) {
            customerResponse.customFields = Object.fromEntries(customerResponse.customFields);
        }

        res.status(200).json({
            customer: customerResponse,
            message: 'Depositor successfully released back to customers list'
        });
    } catch (error) {
        console.error('Error releasing depositor:', error);
        res.status(500).json({ message: 'Failed to release depositor' });
    }
});

// Release depositor directly back to leads (Alternative release path)
app.post('/api/depositors/:id/release', authenticate, async (req, res) => {
    try {
        // Only agents can release their own depositors
        if (req.user.role !== 'agent') {
            return res.status(403).json({ message: 'Only agents can release depositors' });
        }

        const depositor = await Depositor.findById(req.params.id);
        if (!depositor) {
            return res.status(404).json({ message: 'Depositor not found' });
        }

        // Check permissions - agents can only release their own depositors
        if (depositor.agent.toString() !== req.user.id) {
            return res.status(403).json({ message: 'You can only release your own depositors' });
        }

        // Find the original lead to restore it
        let originalLead = null;
        if (depositor.originalLead) {
            originalLead = await Lead.findById(depositor.originalLead);
        }

        // Determine which lead list to use
        let targetLeadList = null;
        let targetListName = 'General Pool';

        if (depositor.originalLeadList) {
            // Try to use the original lead list
            const originalLeadList = await LeadList.findById(depositor.originalLeadList);
            if (originalLeadList && originalLeadList.isActive) {
                targetLeadList = originalLeadList;
                targetListName = originalLeadList.name;
            }
        }

        // If no original list or it's inactive, use the "Users with no list" list
        if (!targetLeadList) {
            const defaultList = await ensureUsersWithNoListExists();
            if (!defaultList) {
                return res.status(500).json({ message: 'Failed to create Users with no list' });
            }

            targetLeadList = defaultList;
            targetListName = defaultList.name;
        }

        let newLead;

        if (originalLead) {
            // Restore the original lead
            originalLead.assignedTo = null; // Release it to general pool
            originalLead.status = depositor.status || 'new';

            // Add note about depositor release            // Replace the lead's notes array with depositor notes plus release note
            originalLead.notes = [
                ...(depositor.notes || []).map(note => ({
                    content: note.content,
                    createdAt: note.createdAt,
                    createdBy: note.createdBy
                })),
                {
                    content: `Depositor released back to leads pool. Returned to "${targetListName}" list.`,
                    createdAt: new Date(),
                    createdBy: req.user.id
                }
            ];

            // Update lead list reference if it changed
            originalLead.leadList = targetLeadList._id;

            await originalLead.save();
            newLead = originalLead;
        } else {
            // Create a new lead from depositor data
            newLead = new Lead({
                status: depositor.status || 'new',
                assignedTo: null, // Released to general pool
                customFields: depositor.customFields || new Map(),
                leadList: targetLeadList._id, notes: [
                    {
                        content: `Lead recreated from depositor release. Added to "${targetListName}" list.`,
                        createdAt: new Date(),
                        createdBy: req.user.id
                    },
                    // Copy all depositor notes
                    ...(depositor.notes || []).map(note => ({
                        content: note.content,
                        createdAt: note.createdAt,
                        createdBy: note.createdBy
                    }))
                ]
            });

            await newLead.save();
        }

        // Delete the depositor record
        await Depositor.findByIdAndDelete(req.params.id);

        // Convert lead customFields for response
        const leadResponse = newLead.toObject();
        if (leadResponse.customFields) {
            leadResponse.customFields = Object.fromEntries(leadResponse.customFields);
        }

        res.status(200).json({
            lead: leadResponse,
            targetList: targetListName,
            message: `Depositor successfully released back to leads pool in "${targetListName}" list`
        });
    } catch (error) {
        console.error('Error releasing depositor to leads:', error);
        res.status(500).json({ message: 'Failed to release depositor to leads' });
    }
});

// Transfer Lead - Admin only functionality to move leads between lists
app.post('/api/leads/:id/transfer', authenticate, async (req, res) => {
    try {
        // Only admins can transfer leads
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Only admins can transfer leads between lists' });
        }

        const leadId = req.params.id;
        const { targetListId } = req.body;

        if (!targetListId) {
            return res.status(400).json({ message: 'Target list ID is required' });
        }

        // Find the lead
        const lead = await Lead.findById(leadId);
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        // Find the target list
        const targetList = await LeadList.findById(targetListId);
        if (!targetList) {
            return res.status(404).json({ message: 'Target list not found' });
        }

        // Get current list name for the note
        let currentListName = 'Unknown';
        if (lead.leadList) {
            const currentList = await LeadList.findById(lead.leadList);
            currentListName = currentList ? currentList.name : 'Unknown';
        }

        // Update the lead's list
        lead.leadList = targetListId;

        // Add a note about the transfer
        if (!lead.notes) {
            lead.notes = [];
        }

        lead.notes.push({
            content: `Lead transferred from "${currentListName}" to "${targetList.name}" by admin ${req.user.name}`,
            createdAt: new Date(),
            createdBy: req.user.id
        });

        await lead.save();

        // Convert lead customFields for response
        const leadResponse = lead.toObject();
        if (leadResponse.customFields) {
            leadResponse.customFields = Object.fromEntries(leadResponse.customFields);
        }

        res.status(200).json({
            lead: leadResponse,
            message: `Lead successfully transferred to "${targetList.name}"`
        });
    } catch (error) {
        console.error('Error transferring lead:', error);
        res.status(500).json({ message: 'Failed to transfer lead' });
    }
});

// Get lead counts for all lists (efficient endpoint)
app.get('/api/leads/counts', authenticate, async (req, res) => {
    try {
        // Get all active lead lists visible to the user
        let leadListFilter = {
            isActive: true,
            isCustomerList: { $ne: true }
        };

        // For non-admin users, only include lists that are visible
        if (req.user.role !== 'admin') {
            leadListFilter.$or = [
                { isVisibleToUsers: true },
                { visibleToSpecificAgents: req.user.id }
            ];
        }
        const leadLists = await LeadList.find(leadListFilter).select('_id name');
        const listIds = leadLists.map(list => list._id);
        console.log(`[DEBUG] Found ${leadLists.length} lead lists:`, leadLists.map(l => ({ id: l._id, name: l.name })));

        // Debug: Check a few lead documents to see their structure
        const sampleLeads = await Lead.find({}).limit(3).select('leadList');
        console.log(`[DEBUG] Sample leads with leadList field:`, sampleLeads);

        // Use MongoDB aggregation to get counts for all lists in one query
        const counts = await Lead.aggregate([
            {
                $match: {
                    leadList: { $in: listIds }
                }
            },
            {
                $group: {
                    _id: '$leadList',
                    count: { $sum: 1 }
                }
            }
        ]);

        console.log(`[DEBUG] Aggregation result:`, counts);

        // Create a map of listId -> count
        const countMap = {};
        counts.forEach(item => {
            countMap[item._id.toString()] = item.count;
        });

        console.log(`[DEBUG] Count map:`, countMap);
        // Return counts for each list (including 0 for lists with no leads)
        const result = leadLists.map(list => ({
            listId: list._id,
            name: list.name,
            count: countMap[list._id.toString()] || 0
        }));

        console.log(`[DEBUG] Final result being sent:`, result);

        const logUserName = req.user?.name || req.user?.username || req.user?.email || req.user?.id || 'Unknown User';
        console.log(`[LEADS COUNTS] User: ${logUserName} | Retrieved counts for ${result.length} lists in single query`);

        res.json(result);
    } catch (error) {
        console.error('Lead counts fetch error:', error);
        res.status(500).json({ message: 'Failed to fetch lead counts' });
    }
});



// Get all meetings for a specific lead (searches all users)
app.get('/api/meetings/for-lead/:leadId', authenticate, async (req, res) => {
    try {
        const { leadId } = req.params;
        // Find all users who have meetings linked to this lead
        const users = await User.find({ "meetings.leadId": leadId }, { meetings: 1, name: 1 });
        // Flatten and filter meetings for this lead
        const meetings = [];
        users.forEach(user => {
            (user.meetings || []).forEach(meeting => {
                if (meeting.leadId && meeting.leadId.toString() === leadId) {
                    meetings.push({
                        ...meeting.toObject ? meeting.toObject() : meeting,
                        userName: user.name
                    });
                }
            });
        });
        res.json(meetings);
    } catch (error) {
        console.error('Fetch meetings for lead error:', error);
        res.status(500).json({ message: 'Failed to fetch meetings for lead' });
    }
});

// Get all meetings for current user
app.get('/api/meetings', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('meetings');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user.meetings);
    } catch (error) {
        console.error('Fetch meetings error:', error);
        res.status(500).json({ message: 'Failed to fetch meetings' });
    }
});

// Add a meeting for current user
app.post('/api/meetings', authenticate, async (req, res) => {
    try {
        const { title, date, time, notes, leadId, module } = req.body; // Add leadId and module
        if (!title || !date) return res.status(400).json({ message: 'Title and date are required' });

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.meetings.push({ title, date, time, notes, leadId, module }); // Save leadId and module
        await user.save();

        res.status(201).json({ message: 'Meeting created' });
    } catch (error) {
        console.error('Add meeting error:', error);
        res.status(500).json({ message: 'Failed to add meeting' });
    }
});

// Update a meeting for current user
app.put('/api/meetings/:meetingId', authenticate, async (req, res) => {
    try {
        const { meetingId } = req.params;
        const { title, date, time, notes } = req.body;
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        const meeting = user.meetings.id(meetingId);
        if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
        if (title !== undefined) meeting.title = title;
        if (date !== undefined) meeting.date = date;
        if (time !== undefined) meeting.time = time;
        if (notes !== undefined) meeting.notes = notes;
        await user.save();
        res.json(meeting);
    } catch (error) {
        console.error('Update meeting error:', error);
        res.status(500).json({ message: 'Failed to update meeting' });
    }
});

// Delete a meeting for current user
app.delete('/api/meetings/:meetingId', authenticate, async (req, res) => {
    try {
        const { meetingId } = req.params;
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        // Remove the meeting by filtering
        const before = user.meetings.length;
        user.meetings = user.meetings.filter(m => m._id.toString() !== meetingId);
        if (user.meetings.length === before) {
            return res.status(404).json({ message: 'Meeting not found' });
        }
        await user.save();
        res.json({ message: 'Meeting deleted' });
    } catch (error) {
        console.error('Delete meeting error:', error);
        res.status(500).json({ message: 'Failed to delete meeting' });
    }
});




// Serve the main HTML page for all other routes (SPA support)
// Routes - serve login page at /login, app at /app, redirect root to app
app.get('/', (req, res) => {
    res.redirect('/app');
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/clock', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'clock.html'));
});



// Catch all other routes and serve appropriate page
app.get('*', (req, res) => {
    // If it's an API route that doesn't exist, return 404
    if (req.path.startsWith('/api/')) {
        res.status(404).json({ message: 'API endpoint not found' });
    } else {
        // For all other routes, redirect to app (which will handle auth)
        res.redirect('/app');
    }
});

const PORT = process.env.PORT || 5000;



app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
