// Quick test script to verify GitHub API behavior
async function testNxRepo() {
  console.log('Testing nx repository workflow fetching...');
  
  try {
    // First, get the list of files
    const response = await fetch('https://api.github.com/repos/nrwl/nx/contents/.github/workflows');
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    
    const files = await response.json();
    console.log(`Total files in .github/workflows: ${files.length}`);
    
    // Filter for YAML files
    const yamlFiles = files.filter(file => 
      file.type === 'file' && 
      (file.name.endsWith('.yml') || file.name.endsWith('.yaml'))
    );
    
    console.log(`YAML workflow files found: ${yamlFiles.length}`);
    yamlFiles.forEach((file, index) => {
      console.log(`${index + 1}. ${file.name}`);
    });
    
    // Test fetching content for first few files
    console.log('\nTesting content fetching for first 3 files...');
    for (let i = 0; i < Math.min(3, yamlFiles.length); i++) {
      const file = yamlFiles[i];
      try {
        const contentResponse = await fetch(file.download_url);
        if (contentResponse.ok) {
          const content = await contentResponse.text();
          console.log(`✓ ${file.name}: ${content.length} characters`);
        } else {
          console.log(`✗ ${file.name}: ${contentResponse.status} ${contentResponse.statusText}`);
        }
      } catch (error) {
        console.log(`✗ ${file.name}: ${error.message}`);
      }
      
      // Add small delay to be respectful to the API
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testNxRepo();
