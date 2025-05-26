module.exports = async ({ github, context }) => {
  console.log('=== 🔍 Starting Inactive Issues Management Script ===');
  console.log(`Repository: ${context.repo.owner}/${context.repo.repo}`);
  console.log(`Event: ${context.eventName}`);
  console.log(`Action: ${context.payload.action || 'N/A'}`);
  console.log(`Workflow: ${context.workflow}`);
  console.log(`Run ID: ${context.runId}`);
  console.log(`Current time: ${new Date().toISOString()}`);
  
  const daysToComment = 60;
  const daysToLabel = 90;
  const now = new Date();
  const idleTimeComment = daysToComment * 24 * 60 * 60 * 1000; // 60 days in milliseconds
  const idleTimeLabel = daysToLabel * 24 * 60 * 60 * 1000; // 90 days in milliseconds
  
  console.log(`Configuration: Comment after ${daysToComment} days, Label after ${daysToLabel} days`);
  
  console.log('Fetching open issues...');
  // Get open issues
  const issues = await github.rest.issues.listForRepo({
    owner: context.repo.owner,
    repo: context.repo.repo,
    state: 'open',
    per_page: 100
  });
  
  console.log(`Retrieved ${issues.data.length} open issues`);
  console.log(`Response status: ${issues.status}`);
  console.log(`Rate limit remaining: ${issues.headers['x-ratelimit-remaining'] || 'unknown'}`);
  console.log(`Rate limit reset: ${issues.headers['x-ratelimit-reset'] || 'unknown'}`);
  
  // For testing: Only process issue #11682
  const testIssueNumber = 11682;
  console.log(`\n=== 🧪 TEST MODE: Processing only issue #${testIssueNumber} ===`);
  
  for (const issue of issues.data) {
    console.log(`\nChecking issue #${issue.number}: "${issue.title}"`);
    
    // Skip pull requests
    if (issue.pull_request) {
      console.log(`Issue #${issue.number} is a pull request, skipping`);
      continue;
    }
    
    // Skip all issues except test issue during testing
    if (issue.number !== testIssueNumber) {
      console.log(`Issue #${issue.number} is not our test issue, skipping`);
      continue;
    }
    
    console.log(`\n=== 📋 Processing test issue #${issue.number} ===`);
    console.log(`Title: "${issue.title}"`);
    console.log(`State: ${issue.state}`);
    console.log(`Author: ${issue.user.login}`);
    console.log(`Created: ${new Date(issue.created_at).toISOString()}`);
    console.log(`URL: ${issue.html_url}`);
    
    // Log all current labels
    console.log(`Labels: ${issue.labels.map(label => label.name).join(', ') || 'none'}`);
    
    // Skip issues that already have the idle label
    if (issue.labels.some(label => label.name === 'idle')) {
      console.log(`⚠️ Issue #${issue.number} already has idle label, skipping further processing`);
      continue;
    }
    
    // Get latest comment or update date
    const issueUpdatedAt = new Date(issue.updated_at);
    const timeSinceUpdate = now.getTime() - issueUpdatedAt.getTime();
    const daysInactive = (timeSinceUpdate/(24*60*60*1000)).toFixed(2);
    
    console.log(`Last updated: ${issueUpdatedAt.toISOString()}`);
    console.log(`Days inactive: ${daysInactive}`);
    console.log(`Milliseconds inactive: ${timeSinceUpdate}`);
    console.log(`60-day threshold (ms): ${idleTimeComment}`);
    console.log(`90-day threshold (ms): ${idleTimeLabel}`);
    
    
    // Check conditions based on inactivity time
    console.log('\n--- Checking inactivity conditions ---');
    
    // Handle 60-day idle issues (comment)
    if (timeSinceUpdate > idleTimeComment && timeSinceUpdate <= idleTimeLabel) {
      console.log(`✓ Condition met: Issue inactive between ${daysToComment} and ${daysToLabel} days`);
      console.log('Action required: Add inactivity comment');
      
      console.log('Fetching issue comments...');
      // Check if bot already commented to avoid duplicate comments
      const comments = await github.rest.issues.listComments({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: issue.number,
        per_page: 100
      });
      
      console.log(`Retrieved ${comments.data.length} comments`);
      
      // Check if there's a recent bot comment
      console.log('Checking for existing bot comments...');
      const botCommented = comments.data.some(comment => {
        const commentDate = new Date(comment.created_at);
        const timeSinceComment = now.getTime() - commentDate.getTime();
        const isBot = comment.user.login === 'github-actions[bot]';
        const isRecent = timeSinceComment < idleTimeComment;
        const hasRightContent = comment.body.includes('Is this issue still relevant?');
        
        if (isBot) {
          console.log(`Found bot comment from: ${commentDate.toISOString()}`);
          console.log(`Comment age (days): ${(timeSinceComment/(24*60*60*1000)).toFixed(2)}`);
          console.log(`Contains marker text: ${hasRightContent}`);
        }
        
        return isBot && isRecent && hasRightContent;
      });
      
      if (botCommented) {
        console.log('⚠️ Bot already commented recently, skipping comment');
      } else {
        console.log(`📝 Adding inactivity comment to issue #${issue.number}: "${issue.title}"`);
        try {
          const result = await github.rest.issues.createComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: issue.number,
            body: `👋 @${issue.user.login} This issue has been open for 60 days with no activity. Is this issue still relevant? If there is no response or activity within the next 30 days, this issue will be labeled as \`idle\`.`
          });
          console.log(`Comment created successfully. Status: ${result.status}`);
          console.log(`Comment URL: ${result.data.html_url}`);
        } catch (error) {
          console.error(`Error adding comment: ${error.message}`);
          console.error(JSON.stringify(error, null, 2));
        }
      }
    }
    
    // Handle 90-day idle issues (add label)
    else if (timeSinceUpdate > idleTimeLabel) {
      console.log(`✓ Condition met: Issue inactive for more than ${daysToLabel} days`);
      console.log('Action required: Add idle label');
      
      // Check if the issue has the idle label
      if (!issue.labels.some(label => label.name === 'idle')) {
        console.log(`🏷️ Adding idle label to issue #${issue.number}: "${issue.title}"`);
        
        try {
          // Add the label
          const labelResult = await github.rest.issues.addLabels({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: issue.number,
            labels: ['idle']
          });
          console.log(`Label added successfully. Status: ${labelResult.status}`);
          
          // Add a comment when labeling as idle
          console.log('Adding idle notification comment');
          const commentResult = await github.rest.issues.createComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: issue.number,
            body: `This issue has been automatically labeled as \`idle\` due to 90 days of inactivity. If this issue is still relevant, please comment to reactivate it.`
          });
          console.log(`Comment added successfully. Status: ${commentResult.status}`);
          console.log(`Comment URL: ${commentResult.data.html_url}`);
        } catch (error) {
          console.error(`Error during labeling: ${error.message}`);
          console.error(JSON.stringify(error, null, 2));
        }
      } else {
        console.log('Issue already has idle label (this shouldn\'t happen due to earlier check)');
      }
    } else {
      console.log(`⚠️ Issue doesn't meet inactivity thresholds. Not taking any action.`);
      console.log(`Inactivity period: ${daysInactive} days`);
      console.log(`Required for comment: > ${daysToComment} days`);
      console.log(`Required for label: > ${daysToLabel} days`);
    }
  }
  
  console.log('\n=== 🎉 Script execution complete ===');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('See logs above for detailed information about each issue processed');
};
