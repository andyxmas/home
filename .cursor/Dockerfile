FROM ubuntu:24.04

RUN apt-get update && \
    apt-get install -y curl ca-certificates build-essential python3 git && \
    rm -rf /var/lib/apt/lists/*

ENV NVM_DIR=/root/.nvm
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash && \
    . "$NVM_DIR/nvm.sh" && \
    nvm install 22 && \
    nvm alias default 22 && \
    ln -s "$(dirname "$(. "$NVM_DIR/nvm.sh" && nvm which current)")" /usr/local/node-bin

ENV PATH="/usr/local/node-bin:$PATH"
