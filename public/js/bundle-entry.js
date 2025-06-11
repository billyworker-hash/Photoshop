// Entry point for bundled application
// Import all the individual modules and set up the application

// Import ApiManager (entry point)
import('./ApiManager.js').then(() => {
    // Import all other modules that depend on ApiManager
    Promise.all([
        import('./Dashboard.js'),
        import('./Leads.js'),
        import('./Customers.js'),
        import('./Depositors.js'),
        import('./Upload.js'),
        import('./Fields.js')
    ]).then(() => {
        // Import and initialize the main app controller
        import('./app.js');
    });
}).catch(error => {
    console.error('Failed to load application modules:', error);
});
