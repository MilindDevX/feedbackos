import 'dotenv/config'
import { classifyFeedback } from '../lib/ai/classify'

async function runTest() {
  console.log('Testing Groq connection with llama-3.1-8b-instant...')
  
  const sampleFeedback = 'The new dashboard is incredibly slow when I try to load more than 50 feedback items. I have to wait 10 seconds for it to render. This makes it impossible to do my job efficiently. Please fix this performance issue.'
  const productAreas = ['Dashboard', 'Reporting', 'Settings', 'API', 'Other']

  try {
    const result = await classifyFeedback('test-feedback-id', sampleFeedback, productAreas)
    console.log('\n✅ Success! Here is the classification result:\n')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error('\n❌ Error testing classification:\n', error)
  }
}

runTest()
