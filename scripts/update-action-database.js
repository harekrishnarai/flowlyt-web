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
   * Fetch all tags for an action to get complete version history
   */
  async fetchAllTags(actionName) {
    try {
      const url = `https://api.github.com/repos/${actionName}/tags?per_page=100`;
      const headers = {};
      
      if (this.githubToken) {
        headers.Authorization = `token ${this.githubToken}`;
      }

      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        console.warn(`⚠️  Failed to fetch tags for ${actionName}: ${response.status}`);
        return [];
      }

      const tags = await response.json();
      return tags;
    } catch (error) {
      console.error(`❌ Error fetching tags for ${actionName}:`, error.message);
      return [];
    }
  }

  /**
   * Fetch the latest release information for an action with multiple versions
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
   * Fetch comprehensive version information including major version tags
   */
  async fetchVersions(actionName, maxVersions = 10) {
    try {
      const tags = await this.fetchAllTags(actionName);
      if (!tags || tags.length === 0) {
        console.warn(`⚠️  No tags found for ${actionName}`);
        return null;
      }

      // Filter and organize versions
      const versions = [];
      const majorVersions = new Set();
      
      // Process tags to find semantic versions and major version tags
      for (const tag of tags) {
        const tagName = tag.name;
        
        // Match semantic versions (v1.2.3) or major versions (v1, v2)
        const semverMatch = tagName.match(/^v(\d+)\.(\d+)\.(\d+)$/);
        const majorMatch = tagName.match(/^v(\d+)$/);
        
        if (semverMatch || majorMatch) {
          const sha = tag.commit.sha;
          
          // Fetch commit details to get the date
          const commitDate = await this.fetchCommitDate(actionName, sha);
          
          versions.push({
            version: tagName,
            sha: sha,
            publishedAt: commitDate,
            isMajorTag: !!majorMatch,
            semver: semverMatch ? {
              major: parseInt(semverMatch[1]),
              minor: parseInt(semverMatch[2]),
              patch: parseInt(semverMatch[3])
            } : null
          });
          
          if (majorMatch) {
            majorVersions.add(tagName);
          }
        }
      }

      // Sort by semantic version (newest first)
      versions.sort((a, b) => {
        if (a.semver && b.semver) {
          if (a.semver.major !== b.semver.major) return b.semver.major - a.semver.major;
          if (a.semver.minor !== b.semver.minor) return b.semver.minor - a.semver.minor;
          return b.semver.patch - a.semver.patch;
        }
        return 0;
      });

      // Get the latest overall version
      const latestVersion = versions.find(v => v.semver);
      
      // Select versions to include: latest from each major version + major tags
      const selectedVersions = [];
      const includedMajors = new Set();
      
      // Include latest full version
      if (latestVersion) {
        selectedVersions.push(latestVersion);
        includedMajors.add(latestVersion.semver.major);
      }

      // Include latest from each major version (limit per major)
      for (const version of versions) {
        if (version.semver && !includedMajors.has(version.semver.major)) {
          selectedVersions.push(version);
          includedMajors.add(version.semver.major);
        }
        
        // Limit total versions
        if (selectedVersions.filter(v => v.semver).length >= maxVersions) {
          break;
        }
      }

      // Include major version tags (v4, v5, v6)
      for (const version of versions) {
        if (version.isMajorTag) {
          selectedVersions.push(version);
        }
      }

      // Remove duplicates
      const uniqueVersions = Array.from(
        new Map(selectedVersions.map(v => [v.version, v])).values()
      );

      return {
        latestVersion: latestVersion?.version || tags[0].name,
        latestSHA: latestVersion?.sha || tags[0].commit.sha,
        versions: uniqueVersions
      };
    } catch (error) {
      console.error(`❌ Error fetching versions for ${actionName}:`, error.message);
      return null;
    }
  }

  /**
   * Fetch commit date
   */
  async fetchCommitDate(actionName, sha) {
    try {
      const url = `https://api.github.com/repos/${actionName}/commits/${sha}`;
      const headers = {};
      
      if (this.githubToken) {
        headers.Authorization = `token ${this.githubToken}`;
      }

      const response = await fetch(url, { headers });
      const data = await response.json();
      
      return data.commit?.committer?.date || new Date().toISOString();
    } catch (error) {
      return new Date().toISOString();
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
    
    const versionInfo = await this.fetchVersions(actionName);
    if (!versionInfo) {
      return false;
    }

    console.log(`✅ Found ${actionName}@${versionInfo.latestVersion} with ${versionInfo.versions.length} versions`);
    
    // Read current database
    let databaseContent = readFileSync(this.databasePath, 'utf8');
    
    // Check if action exists in database
    const actionPattern = new RegExp(`'${actionName.replace('/', '\\/')}':\\s*{[^}]*}`, 'gs');
    const actionExists = actionPattern.test(databaseContent);
    
    if (actionExists) {
      // Update existing action
      await this.updateExistingActionComprehensive(actionName, versionInfo);
    } else {
      // Add new action
      await this.addNewActionComprehensive(actionName, versionInfo);
    }

    return true;
  }

  /**
   * Update existing action in database (legacy single version method)
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
   * Update existing action with comprehensive version information
   */
  async updateExistingActionComprehensive(actionName, versionInfo) {
    console.log(`📝 Comprehensively updating action: ${actionName}`);
    
    let databaseContent = readFileSync(this.databasePath, 'utf8');
    
    // Build the versions array
    const versionsArray = versionInfo.versions
      .map(v => {
        const desc = v.isMajorTag 
          ? `Points to latest v${v.version.substring(1)}.x.x`
          : (v === versionInfo.versions[0] ? 'Latest stable release' : '');
        
        return `      {
        version: '${v.version}',
        sha: '${v.sha}',
        publishedAt: '${v.publishedAt}'${desc ? `,\n        description: '${desc}'` : ''}
      }`;
      })
      .join(',\n');

    // Find and replace the entire action entry
    const escapedName = actionName.replace(/\//g, '\\/');
    const actionPattern = new RegExp(
      `  '${escapedName}':\\s*\\{[\\s\\S]*?latestVersion:[^,]*,[\\s\\S]*?latestSHA:[^,]*,[\\s\\S]*?versions:\\s*\\[[\\s\\S]*?\\]\\s*\\}`,
      'g'
    );

    const [owner, repo] = actionName.split('/');
    const isOfficial = ['actions', 'github'].includes(owner);

    const newEntry = `  '${actionName}': {
    name: '${actionName}',
    owner: '${owner}',
    repository: '${repo}',
    description: 'Action for ${repo}',
    isOfficial: ${isOfficial},
    latestVersion: '${versionInfo.latestVersion}',
    latestSHA: '${versionInfo.latestSHA}',
    versions: [
${versionsArray}
    ]
  }`;

    databaseContent = databaseContent.replace(actionPattern, newEntry);
    
    writeFileSync(this.databasePath, databaseContent, 'utf8');
    console.log(`✅ Comprehensively updated ${actionName} with ${versionInfo.versions.length} versions`);
  }

  /**
   * Add new action to database (legacy single version method)
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
   * Add new action with comprehensive version information
   */
  async addNewActionComprehensive(actionName, versionInfo) {
    console.log(`➕ Adding new action with full version history: ${actionName}`);
    
    let databaseContent = readFileSync(this.databasePath, 'utf8');
    
    // Build the versions array
    const versionsArray = versionInfo.versions
      .map(v => {
        const desc = v.isMajorTag 
          ? `Points to latest v${v.version.substring(1)}.x.x`
          : (v === versionInfo.versions[0] ? 'Latest stable release' : '');
        
        return `      {
        version: '${v.version}',
        sha: '${v.sha}',
        publishedAt: '${v.publishedAt}'${desc ? `,\n        description: '${desc}'` : ''}
      }`;
      })
      .join(',\n');

    const [owner, repo] = actionName.split('/');
    const isOfficial = ['actions', 'github'].includes(owner);

    const newEntry = `
  '${actionName}': {
    name: '${actionName}',
    owner: '${owner}',
    repository: '${repo}',
    description: 'Action for ${repo}',
    isOfficial: ${isOfficial},
    latestVersion: '${versionInfo.latestVersion}',
    latestSHA: '${versionInfo.latestSHA}',
    versions: [
${versionsArray}
    ]
  },`;
    
    // Find the end of the ACTION_HASH_DATABASE object and insert before it
    const insertPosition = databaseContent.lastIndexOf('};');
    
    if (insertPosition === -1) {
      throw new Error('Could not find insertion point in database file');
    }
    
    const beforeInsert = databaseContent.substring(0, insertPosition);
    const afterInsert = databaseContent.substring(insertPosition);
    
    const updatedContent = beforeInsert + newEntry + '\n' + afterInsert;
    
    writeFileSync(this.databasePath, updatedContent, 'utf8');
    console.log(`✅ Added new action ${actionName} with ${versionInfo.versions.length} versions`);
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
