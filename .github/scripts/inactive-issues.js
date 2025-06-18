module.exports = async ({ github, context }) => {
  const daysToComment = 60;
  const daysToLabel = 90;
  const now = new Date();
  const idleTimeComment = daysToComment * 24 * 60 * 60 * 1000; // 60 days in milliseconds
  const idleTimeLabel = daysToLabel * 24 * 60 * 60 * 1000; // 90 days in milliseconds
  
  // Function to fetch issues until we find recently updated ones
  async function fetchAllIssues() {
    let allIssues = [];
    let page = 1;
    let hasNextPage = true;
    const now = new Date();
    const minInactivity = idleTimeComment; // 60 days in milliseconds
    
    while (hasNextPage) {
      const response = await github.rest.issues.listForRepo({
        owner: context.repo.owner,
        repo: context.repo.repo,
        state: 'open',
        per_page: 100,
        page: page,
        sort: 'updated',
        direction: 'asc' // Oldest updated first
      });
      
      // Check if the most recently updated issue on this page is too recent
      let recentIssueFound = false;
      if (response.data.length > 0) {
        // Check the last issue on the page (most recently updated)
        const lastIssue = response.data[response.data.length - 1];
        const lastIssueUpdatedAt = new Date(lastIssue.updated_at);
        const timeSinceLastIssueUpdate = now.getTime() - lastIssueUpdatedAt.getTime();
        
        if (timeSinceLastIssueUpdate < minInactivity) {
          // This page already has issues that are too recent, filter them out
          const filteredIssues = response.data.filter(issue => {
            const issueUpdatedAt = new Date(issue.updated_at);
            const timeSinceUpdate = now.getTime() - issueUpdatedAt.getTime();
            return timeSinceUpdate >= minInactivity;
          });
          
          allIssues = allIssues.concat(filteredIssues);
          recentIssueFound = true;
          hasNextPage = false;
        } else {
          // All issues on this page are old enough, keep them all
          allIssues = allIssues.concat(response.data);
        }
      }
      
      // Stop if we found recent issues or reached the end of pagination
      if (recentIssueFound) {
        hasNextPage = false;
      } else if (response.data.length < 100) {
        hasNextPage = false;
      } else {
        page++;
        // Small delay to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return allIssues;
  }
  
  // Fetch all issues
  const allIssues = await fetchAllIssues();
  
  let processedCount = 0;
  let commentedCount = 0;
  let labeledCount = 0;
  
  for (const issue of allIssues) {
    processedCount++;
    
    // Skip pull requests
    if (issue.pull_request) {
      continue;
    }
    
    // Skip issues that already have the idle label
    if (issue.labels.some(label => label.name === 'idle')) {
      continue;
    }
    
    // Get latest comment or update date
    const issueUpdatedAt = new Date(issue.updated_at);
    const timeSinceUpdate = now.getTime() - issueUpdatedAt.getTime();
    
    // Handle 60-day idle issues (comment)
    if (timeSinceUpdate > idleTimeComment && timeSinceUpdate <= idleTimeLabel) {
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
        const isBot = comment.user.login === 'github-actions[bot]';
        const isRecent = timeSinceComment < idleTimeComment;
        const hasRightContent = comment.body.includes('Is this issue still relevant?');
        
        return isBot && isRecent && hasRightContent;
      });
      
      if (!botCommented) {
        try {
          const result = await github.rest.issues.createComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: issue.number,
            body: `👋 @${issue.user.login} This issue has been open for 60 days with no activity. Is this issue still relevant? If there is no response or activity within the next 30 days, this issue will be labeled as \`idle\`.`
          });
          commentedCount++;
        } catch (error) {
          // Add retry logic
          try {
            // Wait for 5 seconds before retrying
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            const retryResult = await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: issue.number,
              body: `👋 @${issue.user.login} This issue has been open for 60 days with no activity. Is this issue still relevant? If there is no response or activity within the next 30 days, this issue will be labeled as \`idle\`.`
            });
            commentedCount++;
          } catch (retryError) {
            // Failed retry, continue with other issues
          }
        }
      }
    }
    
    // Handle 90-day idle issues (add label)
    else if (timeSinceUpdate > idleTimeLabel) {
      // Check if the issue has the idle label
      if (!issue.labels.some(label => label.name === 'idle')) {
        try {
          // Add the label
          const labelResult = await github.rest.issues.addLabels({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: issue.number,
            labels: ['idle']
          });
          
          // Add a comment when labeling as idle
          const commentResult = await github.rest.issues.createComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: issue.number,
            body: `This issue has been automatically labeled as \`idle\` due to 90 days of inactivity. If this issue is still relevant, please comment to reactivate it.`
          });
          labeledCount++;
        } catch (error) {
          // Add retry logic with exponential backoff
          try {
            // Wait for 5 seconds before retrying
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            const retryLabelResult = await github.rest.issues.addLabels({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: issue.number,
              labels: ['idle']
            });
            
            // Retry adding comment
            const retryCommentResult = await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: issue.number,
              body: `This issue has been automatically labeled as \`idle\` due to 90 days of inactivity. If this issue is still relevant, please comment to reactivate it.`
            });
            labeledCount++;
          } catch (retryError) {
            // Continue with other issues if retry fails
          }
        }
      }
    }
  }
};
