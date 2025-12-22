# Use a lightweight Node.js image
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package files first to leverage Docker cache for dependencies
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the application code
COPY . .

# Make the CLI the entrypoint. 
# Any arguments passed to 'docker run' will be appended to this.
ENTRYPOINT ["node", "index.js"]