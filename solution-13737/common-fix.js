// Fixed common.js for issue #13737 - removes problematic chained imports
// DIRECT IMPORT instead of chained exports to avoid loading issues
// Fixed common.js for issue #13737 - removes problematic chained imports
// DIRECT IMPORT instead of chained exports to avoid loading issues
import userManager from './userManager.js';
import { Accounts } from 'meteor/accounts-base';

// Async configuration function to ensure proper initialization
async function configureAccounts() {
    // Wait for userManager to be ready
    await userManager.initialize();
    
    // Now safe to configure Accounts
    Accounts.onCreateUser(userManager.onCreateUser.bind(userManager));
    
    console.log('Accounts configured with userManager');
}

// Initialize when module loads (with error handling)
configureAccounts().catch(error => {
    console.error('Failed to configure accounts:', error);
});

// Export for external use
export { configureAccounts };
export { userManager };
