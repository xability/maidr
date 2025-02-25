FROM node:20

# Install required libraries
RUN apt-get update && apt-get install -y \
    xvfb \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libgtk-3-0 \
    libgbm1 \
    libasound2

# Set the working directory
WORKDIR /workspace

# Copy the package.json and package-lock.json files
COPY package*.json ./

# Install project dependencies
RUN npm install

# Copy the rest of the project files
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Command to start the application
CMD ["npm", "start"]