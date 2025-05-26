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
  
  // Function to fetch issues until we find recently updated ones
  async function fetchAllIssues() {
    let allIssues = [];
    let page = 1;
    let hasNextPage = true;
    const now = new Date();
    const minInactivity = idleTimeComment; // 60 days in milliseconds
    
    console.log('Starting to fetch issues (oldest first)...');
    console.log(`Will stop fetching when issues are newer than ${daysToComment} days inactive`);
    
    while (hasNextPage) {
      console.log(`Fetching page ${page} of issues...`);
      
      const response = await github.rest.issues.listForRepo({
        owner: context.repo.owner,
        repo: context.repo.repo,
        state: 'open',
        per_page: 100,
        page: page,
        sort: 'updated',
        direction: 'asc' // Oldest updated first
      });
      
      console.log(`Retrieved ${response.data.length} issues on page ${page}`);
      console.log(`Response status: ${response.status}`);
      console.log(`Rate limit remaining: ${response.headers['x-ratelimit-remaining'] || 'unknown'}`);
      
      // Check if the most recently updated issue on this page is too recent
      let recentIssueFound = false;
      if (response.data.length > 0) {
        // Check the last issue on the page (most recently updated)
        const lastIssue = response.data[response.data.length - 1];
        const lastIssueUpdatedAt = new Date(lastIssue.updated_at);
        const timeSinceLastIssueUpdate = now.getTime() - lastIssueUpdatedAt.getTime();
        
        console.log(`Most recent issue on page ${page} was updated ${(timeSinceLastIssueUpdate/(24*60*60*1000)).toFixed(2)} days ago`);
        
        if (timeSinceLastIssueUpdate < minInactivity) {
          // This page already has issues that are too recent, filter them out
          console.log(`Found issues updated within the last ${daysToComment} days, filtering and stopping pagination`);
          
          const filteredIssues = response.data.filter(issue => {
            const issueUpdatedAt = new Date(issue.updated_at);
            const timeSinceUpdate = now.getTime() - issueUpdatedAt.getTime();
            return timeSinceUpdate >= minInactivity;
          });
          
          console.log(`Keeping ${filteredIssues.length} issues from page ${page} that are inactive for at least ${daysToComment} days`);
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
        console.log('Stopping pagination due to finding recently updated issues');
        hasNextPage = false;
      } else if (response.data.length < 100) {
        console.log('Reached the last page of issues');
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
  
  console.log(`Retrieved a total of ${allIssues.length} open issues`);
  console.log('Issues are sorted by update date (oldest first)');
  
  console.log('\n=== Processing all issues sorted by oldest update first ===');
  
  let processedCount = 0;
  let commentedCount = 0;
  let labeledCount = 0;
  
  for (const issue of allIssues) {
    processedCount++;
    console.log(`\nChecking issue #${issue.number}: "${issue.title}" (${processedCount}/${allIssues.length})`);
    
    // Skip pull requests
    if (issue.pull_request) {
      console.log(`Issue #${issue.number} is a pull request, skipping`);
      continue;
    }

    if(issue.number != 11682) continue
    
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
          commentedCount++;
        } catch (error) {
          console.error(`Error adding comment: ${error.message}`);
          console.error(`Error type: ${error.name}`);
          console.error(`Error stack: ${error.stack}`);
          
          // Add retry logic
          console.log(`Will retry commenting on issue #${issue.number} after a delay...`);
          try {
            // Wait for 5 seconds before retrying
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            console.log(`Retrying comment on issue #${issue.number}...`);
            const retryResult = await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: issue.number,
              body: `👋 @${issue.user.login} This issue has been open for 60 days with no activity. Is this issue still relevant? If there is no response or activity within the next 30 days, this issue will be labeled as \`idle\`.`
            });
            console.log(`Retry successful! Comment URL: ${retryResult.data.html_url}`);
            commentedCount++;
          } catch (retryError) {
            console.error(`Retry also failed for issue #${issue.number}: ${retryError.message}`);
            console.error(`Will skip this issue and continue with others`);
          }
        }
      }
    }
    
    // Handle 90-day idle issues (add label)
    else if (timeSinceUpdate > idleTimeLabel) {
      console.log(`✓ Condition met: Issue inactive for more than ${daysToLabel} days`);
      console.log('Action required: Add idle label');
      
      // Check if the issue has the idle label
      if (!issue.labels.some(label => label.name === 'idle')) {
        console.log(`\n🚨 ATUALIZANDO LABEL DA ISSUE 🚨`);
        console.log(`🏷️ Adicionando label 'idle' para issue #${issue.number}`);
        console.log(`🔗 URL: ${issue.html_url}`);
        console.log(`📝 Título: "${issue.title}"`);
        console.log(`👤 Autor: ${issue.user.login}`);
        console.log(`📅 Criada em: ${new Date(issue.created_at).toISOString()}`);
        console.log(`⏰ Última atualização: ${new Date(issue.updated_at).toISOString()}`);
        console.log(`⏳ Dias inativo: ${(timeSinceUpdate/(24*60*60*1000)).toFixed(2)}`);
        
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
          labeledCount++;
        } catch (error) {
          console.error(`Error during labeling: ${error.message}`);
          // Use a safer way to log the error without circular references
          console.error(`Error type: ${error.name}`);
          console.error(`Error stack: ${error.stack}`);
          
          // Add retry logic with exponential backoff
          console.log(`Will retry labeling issue #${issue.number} after a delay...`);
          try {
            // Wait for 5 seconds before retrying
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            console.log(`Retrying adding idle label to issue #${issue.number}...`);
            const retryLabelResult = await github.rest.issues.addLabels({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: issue.number,
              labels: ['idle']
            });
            console.log(`Retry successful! Label added with status: ${retryLabelResult.status}`);
            
            // Retry adding comment
            console.log('Retrying adding idle notification comment...');
            const retryCommentResult = await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: issue.number,
              body: `This issue has been automatically labeled as \`idle\` due to 90 days of inactivity. If this issue is still relevant, please comment to reactivate it.`
            });
            console.log(`Retry comment successful! URL: ${retryCommentResult.data.html_url}`);
            labeledCount++;
          } catch (retryError) {
            console.error(`Retry also failed for issue #${issue.number}: ${retryError.message}`);
            console.error(`Will skip this issue and continue with others`);
          }
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
    
    // Update counters based on actions taken - these will be incremented within the action blocks
  }
  
  console.log('\n=== 🎉 Script execution complete ===');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Total issues processed: ${processedCount}`);
  console.log(`Issues commented (60+ days inactive): ${commentedCount}`);
  console.log(`Issues labeled (90+ days inactive): ${labeledCount}`);
  console.log('See logs above for detailed information about each issue processed');
};
