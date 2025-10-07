// Fixed userManager.js for issue #13737
// Define missing variable that was causing undefined error
const createUserHooks = [];

console.log('loading user manager');

const userManager = {
    _initialized: false,
    
    async initialize() {
        if (this._initialized) return;
        
        console.log('UserManager initializing...');
        // Simulate any async setup work
        await new Promise(resolve => setImmediate(resolve));
        
        this._initialized = true;
        console.log('UserManager initialized');
    },
    
    async onCreateUser(options, user) {
        // Ensure initialization before processing
        await this.initialize();
        
        try {
            let updateUser = { ...user };
            
            // Process user creation hooks
            for (const hook of createUserHooks) {
                updateUser = { ...(await hook(options, updateUser)) };
            }
            
            return updateUser;
        } catch (error) {
            console.error('Error in onCreateUser:', error);
            throw error;
        }
    }
};

// Initialize the userManager during module load in a safe, non-TLA way
(async () => {
    try {
        await userManager.initialize();
        console.log('userManager ready for export');
    } catch (err) {
        console.error('Failed to initialize userManager during module load:', err);
    }
})();

export default userManager;
