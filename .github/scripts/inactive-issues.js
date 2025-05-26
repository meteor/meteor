module.exports = async ({ github, context }) => {
  const daysToComment = 60;
  const daysToLabel = 90;
  const now = new Date();
  const inactiveTimeComment = daysToComment * 24 * 60 * 60 * 1000; // 60 days in milliseconds
  const inactiveTimeLabel = daysToLabel * 24 * 60 * 60 * 1000; // 90 days in milliseconds
  
  // Get open issues
  const issues = await github.rest.issues.listForRepo({
    owner: context.repo.owner,
    repo: context.repo.repo,
    state: 'open',
    per_page: 100
  });
  
  // For testing: Only process issue #11682
  const testIssueNumber = 11682;
  console.log(`Testing script on issue #${testIssueNumber} only`);
  
  for (const issue of issues.data) {
    if (issue.pull_request) continue;
    
    // Skip all issues except #11682 during testing
    if (issue.number !== testIssueNumber) {
      continue;
    }
    // Skip issues that already have the inactive label
    if (issue.labels.some(label => label.name === 'inactive')) {
      console.log(`Issue #${issue.number} already has inactive label, skipping`);
      continue;
    }
    
    // Get latest comment or update date
    const issueUpdatedAt = new Date(issue.updated_at);
    const timeSinceUpdate = now.getTime() - issueUpdatedAt.getTime();
    console.log(`Issue #${issue.number} last updated: ${issueUpdatedAt}, days inactive: ${timeSinceUpdate/(24*60*60*1000)}`);
    
    
    // Handle 60-day inactive issues (comment)
    if (timeSinceUpdate > inactiveTimeComment && timeSinceUpdate <= inactiveTimeLabel) {
      
      // Check if bot already commented to avoid duplicate comments
      const comments = await github.rest.issues.listComments({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: issue.number,
        per_page: 100
      });
      
      // Check if there's a recent bot comment
      const botCommented = comments.data.some(comment => {
        const commentDate = new Date(comment.created_at);
        const timeSinceComment = now.getTime() - commentDate.getTime();
        return (
          comment.user.login === 'github-actions[bot]' && 
          timeSinceComment < inactiveTimeComment && 
          comment.body.includes('Is this issue still relevant?')
        );
      });
      
      if (!botCommented) {
        console.log(`Adding inactivity comment to issue #${issue.number}: ${issue.title}`);
        await github.rest.issues.createComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: issue.number,
          body: `👋 @${issue.user.login} This issue has been open for 60 days with no activity. Is this issue still relevant? If there is no response or activity within the next 30 days, this issue will be labeled as \`inactive\`.`
        });
      }
    }
    
    // Handle 90-day inactive issues (add label)
    else if (forcedTimeSinceUpdate > inactiveTimeLabel) {
      // Check if the issue has the inactive label
      if (!issue.labels.some(label => label.name === 'inactive')) {
        console.log(`Adding inactive label to issue #${issue.number}: ${issue.title}`);
        await github.rest.issues.addLabels({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: issue.number,
          labels: ['inactive']
        });
        
        // Add a comment when labeling as inactive
        await github.rest.issues.createComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: issue.number,
          body: `This issue has been automatically labeled as \`inactive\` due to 90 days of inactivity. If this issue is still relevant, please comment to reactivate it.`
        });
      }
    }
  }
};
