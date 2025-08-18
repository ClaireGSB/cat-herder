#!/bin/bash

# 1. Remove any old mock data from the project root
echo "Cleaning up old mock data..."
rm -rf .claude

# 2. Copy the fresh, consistent mock data to the root
echo "Copying fresh mock data..."
cp -r test/mock-data/.claude .

echo "Mock data is ready."