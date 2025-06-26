#!/usr/bin/env node

/**
 * GitHub Actions Database Update Script
 * 
 * This script helps maintain the action hash database by fetching
 * the latest SHA hashes for popular GitHub Actions.
 * 
 * Usage:
 *   npm run update-actions
 *   node scripts/update-action-database.js --action="actions/checkout"
 *   node scripts/update-action-database.js --verify
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Popular GitHub Actions to monitor
const POPULAR_ACTIONS = [
  'actions/checkout',
  'actions/setup-node', 
  'actions/setup-python',
  'actions/setup-java',
  'actions/upload-artifact',
  'actions/download-artifact',
  'actions/cache',
  'docker/build-push-action',
  'docker/setup-buildx-action',
  'codecov/codecov-action',
  'hashicorp/setup-terraform',
  'azure/login',
  'aws-actions/configure-aws-credentials'
];

class ActionDatabaseUpdater {
  constructor() {
    this.databasePath = join(process.cwd(), 'src/utils/actionHashDatabase.ts');
    this.githubToken = process.env.GITHUB_TOKEN;
  }

  /**
   * Fetch the latest release information for an action
   */
  async fetchLatestRelease(actionName) {
    try {
      const url = `https://api.github.com/repos/${actionName}/releases/latest`;
      const headers = {};
      
      if (this.githubToken) {
        headers.Authorization = `token ${this.githubToken}`;
      }

      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        console.warn(`⚠️  Failed to fetch ${actionName}: ${response.status}`);
        return null;
      }

      const release = await response.json();
      
      return {
        version: release.tag_name,
        sha: await this.fetchCommitSHA(actionName, release.tag_name),
        publishedAt: release.published_at,
        description: release.name || release.tag_name
      };
    } catch (error) {
      console.error(`❌ Error fetching ${actionName}:`, error.message);
      return null;
    }
  }

  /**
   * Fetch commit SHA for a specific tag
   */
  async fetchCommitSHA(actionName, tag) {
    try {
      const url = `https://api.github.com/repos/${actionName}/git/refs/tags/${tag}`;
      const headers = {};
      
      if (this.githubToken) {
        headers.Authorization = `token ${this.githubToken}`;
      }

      const response = await fetch(url, { headers });
      const data = await response.json();
      
      if (data.object.type === 'tag') {
        // Annotated tag - need to get the commit it points to
        const tagResponse = await fetch(data.object.url, { headers });
        const tagData = await tagResponse.json();
        return tagData.object.sha;
      } else {
        // Direct commit reference
        return data.object.sha;
      }
    } catch (error) {
      console.error(`❌ Error fetching SHA for ${actionName}@${tag}:`, error.message);
      return null;
    }
  }

  /**
   * Update database with new action information
   */
  async updateAction(actionName) {
    console.log(`🔄 Updating ${actionName}...`);
    
    const release = await this.fetchLatestRelease(actionName);
    if (!release) {
      return false;
    }

    console.log(`✅ Found ${actionName}@${release.version} (${release.sha?.substring(0, 8)}...)`);
    
    // Read current database
    let databaseContent = readFileSync(this.databasePath, 'utf8');
    
    // Check if action exists in database
    const actionPattern = new RegExp(`'${actionName.replace('/', '\\/')}':\\s*{[^}]*}`, 'gs');
    const actionExists = actionPattern.test(databaseContent);
    
    if (actionExists) {
      // Update existing action
      await this.updateExistingAction(actionName, release);
    } else {
      // Add new action
      await this.addNewAction(actionName, release);
    }

    return true;
  }

  /**
   * Update existing action in database
   */
  async updateExistingAction(actionName, release) {
    console.log(`📝 Updating existing action: ${actionName}`);
    
    let databaseContent = readFileSync(this.databasePath, 'utf8');
    
    // Find the action entry and update specific fields
    const actionPattern = new RegExp(
      `('${actionName.replace('/', '\\/')}':\\s*{[^}]*?)latestVersion:\\s*'[^']*'([^}]*?)latestSHA:\\s*'[^']*'([^}]*?})`,
      'gs'
    );
    
    databaseContent = databaseContent.replace(actionPattern, (match, prefix, middle, suffix) => {
      return `${prefix}latestVersion: '${release.version}'${middle}latestSHA: '${release.sha}'${suffix}`;
    });
    
    // Add new version to versions array
    const versionsPattern = new RegExp(
      `('${actionName.replace('/', '\\/')}':[^{]*{[^}]*?versions:\\s*\\[)([^\\]]*)(\\])`,
      'gs'
    );
    
    databaseContent = databaseContent.replace(versionsPattern, (match, prefix, versions, suffix) => {
      // Check if this version already exists
      if (versions.includes(`version: '${release.version}'`)) {
        return match; // Version already exists, don't duplicate
      }
      
      const newVersion = `
      {
        version: '${release.version}',
        sha: '${release.sha}',
        publishedAt: '${release.publishedAt}',
        description: 'Latest stable release'
      },`;
      
      return `${prefix}${newVersion}${versions}${suffix}`;
    });
    
    writeFileSync(this.databasePath, databaseContent, 'utf8');
    console.log(`✅ Updated ${actionName} to version ${release.version}`);
  }

  /**
   * Add new action to database
   */
  async addNewAction(actionName, release) {
    console.log(`➕ Adding new action: ${actionName}`);
    
    let databaseContent = readFileSync(this.databasePath, 'utf8');
    
    const newActionEntry = this.generateActionTemplate(
      actionName, 
      release.version, 
      release.sha,
      release.publishedAt,
      release.description
    );
    
    // Find the end of the ACTION_HASH_DATABASE object and insert before it
    const insertPosition = databaseContent.lastIndexOf('};');
    
    if (insertPosition === -1) {
      throw new Error('Could not find insertion point in database file');
    }
    
    const beforeInsert = databaseContent.substring(0, insertPosition);
    const afterInsert = databaseContent.substring(insertPosition);
    
    const updatedContent = beforeInsert + newActionEntry + '\n' + afterInsert;
    
    writeFileSync(this.databasePath, updatedContent, 'utf8');
    console.log(`✅ Added new action ${actionName}`);
  }

  /**
   * Verify current database entries
   */
  async verifyDatabase() {
    console.log('🔍 Verifying current database entries...\n');
    
    const databaseContent = readFileSync(this.databasePath, 'utf8');
    
    // Extract action names from database (simple regex parsing)
    const actionMatches = databaseContent.match(/'([^']+\/[^']+)':\s*{/g);
    
    if (!actionMatches) {
      console.log('❌ No actions found in database');
      return;
    }

    const actionsInDB = actionMatches.map(match => 
      match.match(/'([^']+)'/)[1]
    );

    let totalChecked = 0;
    let upToDate = 0;
    let needsUpdate = 0;

    for (const actionName of actionsInDB) {
      totalChecked++;
      const release = await this.fetchLatestRelease(actionName);
      
      if (release) {
        // Simple check - just report the latest version
        console.log(`📦 ${actionName.padEnd(30)} Latest: ${release.version}`);
        upToDate++;
      } else {
        console.log(`❌ ${actionName.padEnd(30)} Failed to fetch`);
        needsUpdate++;
      }
      
      // Rate limiting - be nice to GitHub API
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Total checked: ${totalChecked}`);
    console.log(`   Accessible: ${upToDate}`);
    console.log(`   Failed: ${needsUpdate}`);
    
    if (!this.githubToken) {
      console.log(`\n💡 Tip: Set GITHUB_TOKEN env var to avoid rate limiting`);
    }
  }

  /**
   * Add new action to database template
   */
  generateActionTemplate(actionName, version, sha, publishedAt, description) {
    const [owner, repo] = actionName.split('/');
    const isOfficial = ['actions', 'github'].includes(owner);
    
    return `
  '${actionName}': {
    name: '${actionName}',
    owner: '${owner}',
    repository: '${repo}',
    description: '${description || `${repo} action by ${owner}`}',
    isOfficial: ${isOfficial},
    latestVersion: '${version}',
    latestSHA: '${sha}',
    versions: [
      {
        version: '${version}',
        sha: '${sha}',
        publishedAt: '${publishedAt}',
        description: '${description || 'Latest stable release'}'
      }
    ]
  },`;
  }

  /**
   * Bulk update all actions in database
   */
  async updateAllActions() {
    console.log('🔄 Updating all actions in database...\n');
    
    const databaseContent = readFileSync(this.databasePath, 'utf8');
    const actionMatches = databaseContent.match(/'([^']+\/[^']+)':\s*{/g);
    
    if (!actionMatches) {
      console.log('❌ No actions found in database');
      return;
    }

    const actionsInDB = actionMatches.map(match => 
      match.match(/'([^']+)'/)[1]
    );

    let updated = 0;
    let failed = 0;

    for (const actionName of actionsInDB) {
      const success = await this.updateAction(actionName);
      
      if (success) {
        updated++;
      } else {
        failed++;
      }
      
      // Rate limiting - be nice to GitHub API
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`\n📊 Bulk Update Summary:`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Total: ${actionsInDB.length}`);
  }

  /**
   * Create backup of database before updates
   */
  createBackup() {
    const backupPath = this.databasePath + `.backup.${new Date().toISOString().split('T')[0]}`;
    const content = readFileSync(this.databasePath, 'utf8');
    writeFileSync(backupPath, content, 'utf8');
    console.log(`💾 Backup created: ${backupPath}`);
    return backupPath;
  }

  /**
   * Main execution
   */
  async run() {
    const args = process.argv.slice(2);
    
    console.log('🚀 Flowlyt Action Database Updater\n');

    // Create backup before any modifications
    if (args.includes('--update') || args.includes('--update-all') || args.find(arg => arg.startsWith('--action='))) {
      this.createBackup();
    }

    if (args.includes('--verify')) {
      await this.verifyDatabase();
      return;
    }

    if (args.includes('--update-all')) {
      await this.updateAllActions();
      return;
    }

    const actionArg = args.find(arg => arg.startsWith('--action='));
    if (actionArg) {
      const actionName = actionArg.split('=')[1];
      const success = await this.updateAction(actionName);
      
      if (success) {
        console.log(`\n✅ Successfully updated ${actionName}`);
      } else {
        console.log(`\n❌ Failed to update ${actionName}`);
      }
      return;
    }

    // Show help by default
    console.log('📋 Available commands:');
    console.log('');
    console.log('  🔍 Verification:');
    console.log('    npm run update-actions -- --verify');
    console.log('    (Check current database entries against GitHub)');
    console.log('');
    console.log('  🔄 Single Action Update:');
    console.log('    npm run update-actions -- --action="actions/checkout"');
    console.log('    (Update specific action to latest version)');
    console.log('');
    console.log('  🚀 Bulk Update:');
    console.log('    npm run update-actions -- --update-all');
    console.log('    (Update all actions in database - use with caution)');
    console.log('');
    console.log('� Examples:');
    console.log('  npm run update-actions -- --action="docker/build-push-action"');
    console.log('  npm run update-actions -- --verify');
    console.log('');
    console.log('💡 Tips:');
    console.log('  • Use --verify to check all database entries');
    console.log('  • Set GITHUB_TOKEN env var for better API rate limits');
    console.log('  • Backups are created automatically before updates');
    
    if (!this.githubToken) {
      console.log('\n⚠️  No GITHUB_TOKEN found. API calls will be rate limited.');
      console.log('   Set GITHUB_TOKEN env var for better performance.');
      console.log('   Get token from: https://github.com/settings/tokens');
    } else {
      console.log('\n✅ GITHUB_TOKEN found - enhanced API rate limits available.');
    }
  }
}

// Run the updater
const updater = new ActionDatabaseUpdater();
updater.run().catch(console.error);
