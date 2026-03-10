/**
* Mark issues as idle after a period of inactivity
* and post reminders after a shorter period of inactivity.
*
* 1. Issues with no human activity for 60 days get a reminder comment.
* 2. Issues with no human activity for 90 days get labeled as "idle" and get a comment.
*
* Human activity is defined as any comment from a non-bot user.
*
* This script is intended to be run as a GitHub Action on a schedule (e.g., daily).
 */
module.exports = async ({ github, context }) => {
  const daysToComment = 60;
  const daysToLabel = 90;

  const idleTimeComment = daysToComment * 24 * 60 * 60 * 1000;
  const idleTimeLabel = daysToLabel * 24 * 60 * 60 * 1000;
  const now = new Date();

  const BOT_LOGIN = 'github-actions[bot]';
  const REMINDER_PHRASE = 'Is this issue still relevant?';

  const COMMENT_60_TEMPLATE = (login) =>
    `👋 @${login} This issue has been open with no human activity for ${daysToComment} days. Is this issue still relevant? If there is no human response or activity within the next ${daysToLabel - daysToComment} days, this issue will be labeled as \`idle\`.`;

  const COMMENT_90_TEXT =
    'This issue has been automatically labeled as `idle` due to 90 days of inactivity (no human interaction). If this is still relevant or if someone is working on it, please comment or add `in-development` label.';

  // Fetch all open issues
  async function fetchAllIssues() {
    let page = 1;
    const per_page = 100;
    const results = [];
    let keepGoing = true;

    while (keepGoing) {
      const { data } = await github.rest.issues.listForRepo({
        owner: context.repo.owner,
        repo: context.repo.repo,
        state: 'open',
        per_page,
        page,
        sort: 'updated',
        direction: 'asc'
      });

      if (!data.length) break;
      results.push(...data);

      if (data.length < per_page) {
        keepGoing = false;
      } else {
        page++;
        await new Promise((r) => setTimeout(r, 120));
      }
    }
    return results;
  }
  // analyse comments to find last human activity and if a reminder was already posted after that
  async function analyzeComments(issueNumber, issueCreatedAt) {
    const commentsResp = await github.rest.issues.listComments({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: issueNumber,
      per_page: 100
    });

    const comments = commentsResp.data;
    let lastHumanActivity = null;

    for (let i = comments.length - 1; i >= 0; i--) {
      const c = comments[i];
      const isBot = c.user?.type === 'Bot' || c.user?.login === BOT_LOGIN;
      if (!isBot) {
        lastHumanActivity = new Date(c.created_at);
        break;
      }
    }

    if (!lastHumanActivity) {
      lastHumanActivity = new Date(issueCreatedAt);
    }

    const hasReminderAfterLastHuman = comments.some(
      (c) =>
        c.user?.login === BOT_LOGIN &&
        c.body?.includes(REMINDER_PHRASE) &&
        new Date(c.created_at) > lastHumanActivity
    );

    return { lastHumanActivity, hasReminderAfterLastHuman };
  }

  const issues = await fetchAllIssues();

  let processed = 0;
  let commented = 0;
  let labeled = 0;
  let skippedPR = 0;

  for (const issue of issues) {
    processed++;

    if (issue.pull_request) {
      skippedPR++;
      continue;
    }

    if (issue.labels.some((l) => l.name === 'idle' || l.name === 'in-development')) {
      continue;
    }

    let analysis;
    try {
      analysis = await analyzeComments(issue.number, issue.created_at);
    } catch (err) {
      continue; // fail to get comments, skip
    }

    const { lastHumanActivity, hasReminderAfterLastHuman } = analysis;
    const inactivityMs = now.getTime() - lastHumanActivity.getTime();

    // 90+ days => label + comment
    if (inactivityMs >= idleTimeLabel) {
      try {
        await github.rest.issues.addLabels({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: issue.number,
          labels: ['idle']
        });
        await github.rest.issues.createComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: issue.number,
          body: COMMENT_90_TEXT
        });
        labeled++;
        continue;
      } catch (err) {
        // retry simples
        try {
          await new Promise((r) => setTimeout(r, 5000));
          await github.rest.issues.addLabels({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: issue.number,
            labels: ['idle']
          });
          await github.rest.issues.createComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: issue.number,
            body: COMMENT_90_TEXT
          });
          labeled++;
        } catch {}
        continue;
      }
    }

    // 60-89 days => comment (once)
    if (
      inactivityMs >= idleTimeComment &&
      inactivityMs < idleTimeLabel &&
      !hasReminderAfterLastHuman
    ) {
      const body = COMMENT_60_TEMPLATE(issue.user.login);
      try {
        await github.rest.issues.createComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: issue.number,
          body
        });
        commented++;
      } catch (err) {
        try {
          await new Promise((r) => setTimeout(r, 5000));
          await github.rest.issues.createComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: issue.number,
            body
          });
          commented++;
        } catch {}
      }
    }
  }

  // Log summary for CI
  console.log(
    JSON.stringify(
      { processed, commented, labeled, skippedPR },
      null,
      2
    )
  );
};
