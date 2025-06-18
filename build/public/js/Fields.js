// Fields.js - Custom Fields Management Module
class FieldsModule {
    constructor() {
        this.fields = [];
        this.currentUser = null;
        this.apiManager = null;
        this.bindEvents();
    }

    init(apiManager, user) {
        this.apiManager = apiManager;
        this.currentUser = user;
    }

    bindEvents() {
        // Show/hide options container based on field type
        document.addEventListener('change', (e) => {
            if (e.target.id === 'field-type') {
                this.toggleOptionsContainer('field-options-container', e.target.value);
            }
            if (e.target.id === 'edit-field-type') {
                this.toggleOptionsContainer('edit-field-options-container', e.target.value);
            }
        });

        // Save new field
        document.getElementById('save-field-btn')?.addEventListener('click', () => {
            this.saveField();
        });

        // Update existing field
        document.getElementById('update-field-btn')?.addEventListener('click', () => {
            this.updateField();
        });

        // Handle field actions (edit, delete)
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('edit-field-btn')) {
                const fieldId = e.target.dataset.fieldId;
                this.editField(fieldId);
            }
            if (e.target.classList.contains('delete-field-btn')) {
                const fieldId = e.target.dataset.fieldId;
                this.deleteField(fieldId);
            }
        });
    }

    toggleOptionsContainer(containerId, fieldType) {
        const container = document.getElementById(containerId);
        if (container) {
            container.style.display = fieldType === 'select' ? 'block' : 'none';
        }
    }    async loadFields() {
        try {
            const response = await this.apiManager.get('/lead-fields');
            this.fields = response;
            this.renderFieldsTable();
        } catch (error) {
            console.error('Error loading fields:', error);
            this.apiManager.showAlert('Error loading custom fields', 'danger');
        }
    }

    renderFieldsTable() {
        const tbody = document.getElementById('fields-table-body');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (this.fields.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-muted">No custom fields defined yet</td>
                </tr>
            `;
            return;
        }

        this.fields.forEach(field => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${field.name}</td>
                <td>${field.label}</td>
                <td>
                    <span class="badge bg-secondary">${this.formatFieldType(field.type)}</span>
                </td>
                <td>
                    ${field.required ? 
                        '<span class="badge bg-warning">Required</span>' : 
                        '<span class="badge bg-light text-dark">Optional</span>'
                    }
                </td>
                <td>${field.order}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary edit-field-btn me-1" 
                            data-field-id="${field._id}" data-bs-toggle="modal" data-bs-target="#editFieldModal">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger delete-field-btn" 
                            data-field-id="${field._id}">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    formatFieldType(type) {
        const typeMap = {
            'text': 'Text',
            'number': 'Number',
            'email': 'Email',
            'phone': 'Phone',
            'select': 'Dropdown',
            'textarea': 'Text Area'
        };
        return typeMap[type] || type;
    }

    async saveField() {
        const form = document.getElementById('add-field-form');
        const formData = new FormData(form);
        
        const fieldData = {
            name: document.getElementById('field-name').value.trim(),
            label: document.getElementById('field-label').value.trim(),
            type: document.getElementById('field-type').value,
            order: parseInt(document.getElementById('field-order').value) || 0,
            required: document.getElementById('field-required').checked
        };

        // Validate field name (no spaces, special characters)
        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(fieldData.name)) {
            this.apiManager.showAlert('Field name must start with a letter and contain only letters, numbers, and underscores', 'danger');
            return;
        }

        // Handle options for select fields
        if (fieldData.type === 'select') {
            const optionsText = document.getElementById('field-options').value.trim();
            if (!optionsText) {
                this.apiManager.showAlert('Please provide options for dropdown field', 'danger');
                return;
            }
            fieldData.options = optionsText.split('\n').map(opt => opt.trim()).filter(opt => opt);
        }        try {
            await this.apiManager.post('/lead-fields', fieldData);
            this.apiManager.showAlert('Custom field created successfully', 'success');
            
            // Reset form and close modal
            form.reset();
            document.getElementById('field-order').value = '0';
            bootstrap.Modal.getInstance(document.getElementById('addFieldModal')).hide();
            
            // Reload fields
            await this.loadFields();
        } catch (error) {
            console.error('Error creating field:', error);
            this.apiManager.showAlert(error.message || 'Error creating custom field', 'danger');
        }
    }

    editField(fieldId) {
        const field = this.fields.find(f => f._id === fieldId);
        if (!field) return;

        // Populate edit form
        document.getElementById('edit-field-id').value = field._id;
        document.getElementById('edit-field-name').value = field.name;
        document.getElementById('edit-field-label').value = field.label;
        document.getElementById('edit-field-type').value = field.type;
        document.getElementById('edit-field-order').value = field.order;
        document.getElementById('edit-field-required').checked = field.required;

        // Handle options for select fields
        if (field.type === 'select' && field.options) {
            document.getElementById('edit-field-options').value = field.options.join('\n');
        }

        // Show/hide options container
        this.toggleOptionsContainer('edit-field-options-container', field.type);
    }

    async updateField() {
        const fieldId = document.getElementById('edit-field-id').value;
        const fieldData = {
            name: document.getElementById('edit-field-name').value.trim(),
            label: document.getElementById('edit-field-label').value.trim(),
            type: document.getElementById('edit-field-type').value,
            order: parseInt(document.getElementById('edit-field-order').value) || 0,
            required: document.getElementById('edit-field-required').checked
        };

        // Validate field name
        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(fieldData.name)) {
            this.apiManager.showAlert('Field name must start with a letter and contain only letters, numbers, and underscores', 'danger');
            return;
        }

        // Handle options for select fields
        if (fieldData.type === 'select') {
            const optionsText = document.getElementById('edit-field-options').value.trim();
            if (!optionsText) {
                this.apiManager.showAlert('Please provide options for dropdown field', 'danger');
                return;
            }
            fieldData.options = optionsText.split('\n').map(opt => opt.trim()).filter(opt => opt);
        }        try {
            await this.apiManager.put(`/lead-fields/${fieldId}`, fieldData);
            this.apiManager.showAlert('Custom field updated successfully', 'success');
            
            // Close modal and reload fields
            bootstrap.Modal.getInstance(document.getElementById('editFieldModal')).hide();
            await this.loadFields();
        } catch (error) {
            console.error('Error updating field:', error);
            this.apiManager.showAlert(error.message || 'Error updating custom field', 'danger');
        }
    }    async deleteField(fieldId) {
        const field = this.fields.find(f => f._id === fieldId);
        if (!field) return;
        
        const confirmed = await window.confirmationModal.confirmDelete(
            field.label,
            'field',
            'This will remove all data stored in this field for existing leads.'
        );
        
        if (confirmed) {
            try {
                await this.apiManager.delete(`/lead-fields/${fieldId}`);
                this.apiManager.showAlert('Custom field deleted successfully', 'success');
                await this.loadFields();
            } catch (error) {
                console.error('Error deleting field:', error);
                this.apiManager.showAlert(error.message || 'Error deleting custom field', 'danger');
            }
        }
    }

    // Get current fields for use by other modules
    getFields() {
        return this.fields;
    }

    // Render custom fields in a form
    renderCustomFieldsInForm(container, leadData = {}) {
        if (!container || this.fields.length === 0) return;

        const customFields = leadData.customFields || {};
        
        this.fields.forEach(field => {
            const fieldDiv = document.createElement('div');
            fieldDiv.className = 'mb-3';

            let fieldHtml = `<label for="custom-${field.name}" class="form-label">${field.label}`;
            if (field.required) {
                fieldHtml += ' <span class="text-danger">*</span>';
            }
            fieldHtml += '</label>';

            const fieldValue = customFields[field.name] || '';

            switch (field.type) {
                case 'textarea':
                    fieldHtml += `<textarea class="form-control" id="custom-${field.name}" name="custom-${field.name}" ${field.required ? 'required' : ''}>${fieldValue}</textarea>`;
                    break;
                case 'select':
                    fieldHtml += `<select class="form-select" id="custom-${field.name}" name="custom-${field.name}" ${field.required ? 'required' : ''}>`;
                    fieldHtml += '<option value="">Select an option</option>';
                    field.options.forEach(option => {
                        fieldHtml += `<option value="${option}" ${fieldValue === option ? 'selected' : ''}>${option}</option>`;
                    });
                    fieldHtml += '</select>';
                    break;
                default:
                    fieldHtml += `<input type="${field.type}" class="form-control" id="custom-${field.name}" name="custom-${field.name}" value="${fieldValue}" ${field.required ? 'required' : ''}>`;
            }

            fieldDiv.innerHTML = fieldHtml;
            container.appendChild(fieldDiv);
        });
    }

    // Extract custom field values from a form
    extractCustomFieldsFromForm(form) {
        const customFields = {};
        
        this.fields.forEach(field => {
            const input = form.querySelector(`[name="custom-${field.name}"]`);
            if (input) {
                customFields[field.name] = input.value;
            }
        });

        return customFields;
    }
}

// Export for use in other modules
window.FieldsModule = FieldsModule;
