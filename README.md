# iquit

A lightweight web application that helps you preserve your Netflix viewing history before canceling your subscription. The app allows you to upload your Netflix viewing history CSV file and displays your viewing data with detailed statistics and information about the content you've watched.

## Features

- Upload and process Netflix viewing history CSV files
- View statistics about your viewing habits
- Browse your watched content with details
- Privacy-focused: all data processing happens locally in your browser
- No data is sent to any server - your viewing history remains private

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- pnpm (preferred) or npm
- Docker (for production builds)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/stream-sense-netflix-explorer.git
cd stream-sense-netflix-explorer

# Install dependencies
pnpm install
```

### Development

```bash
# Start the development server
pnpm dev
```

Visit `http://localhost:5173` to see the application.

## Deployment

### Docker

```bash
# Build the Docker image
docker build -t iquit .

# Run the container
docker run -p 8080:80 iquit
```
