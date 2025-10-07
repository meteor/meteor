// Fixed test file for issue #13737
import { expect } from 'chai';

// IMPORTANT: Direct import to avoid problematic export chains
import userManager from './userManager-fix.js';

describe('UserManager - Issue #13737 Fix', function() {
    before(async function() {
        // Ensure userManager is fully initialized
        await userManager.initialize();

        console.log('Test setup complete - userManager ready');
    });

    it('should handle async user creation properly', async function() {
        const options = { username: 'testuser' };
        const user = { _id: 'test123', username: 'testuser' };

        const result = await userManager.onCreateUser(options, user);

        expect(result).to.be.an('object');
        expect(result).to.have.property('username', 'testuser');
        expect(result._id).to.equal('test123');
    });

    it('should maintain user properties during processing', async function() {
        const options = { profile: { name: 'Test User' } };
        const user = { 
            _id: 'test456', 
            username: 'testuser2',
            profile: { name: 'Test User' }
        };

        const result = await userManager.onCreateUser(options, user);

        expect(result.profile).to.deep.equal({ name: 'Test User' });
    });
});
