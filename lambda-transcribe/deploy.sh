#!/bin/bash

# AWS Lambda Deployment Script for Quran Transcription Function

echo "🚀 Deploying Lambda function..."

# Remove old zip if exists
if [ -f "function.zip" ]; then
    echo "🗑️  Removing old function.zip..."
    rm function.zip
fi

# Create deployment package
echo "📦 Creating deployment package..."
zip -r function.zip index.js node_modules/ package.json

# Check if zip was created successfully
if [ ! -f "function.zip" ]; then
    echo "❌ Error: Failed to create function.zip"
    exit 1
fi

# Show file size
ZIP_SIZE=$(du -h function.zip | cut -f1)
echo "✅ Deployment package created: $ZIP_SIZE"

echo ""
echo "📝 Next steps:"
echo "1. Go to AWS Lambda Console"
echo "2. Select function: auto-quran-transcribe-chunk"
echo "3. Click 'Upload from' → '.zip file'"
echo "4. Upload function.zip"
echo "5. Click 'Save'"
echo ""
echo "🔧 Make sure to set:"
echo "   - Handler: index.handler"
echo "   - Runtime: Node.js 18.x"
echo "   - Timeout: 900 seconds (15 min)"
echo "   - Memory: 512 MB"
echo "   - Environment: OPENAI_API_KEY=your_key"
echo ""
echo "✅ Done! function.zip is ready for upload."

