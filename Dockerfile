FROM node:22-alpine

ENV NODE_ENV=production
ENV PORT=7860
WORKDIR /app

COPY server.js index.html cross-planner.js corner-planner.js layer-planners.js cross-controller.js ./
COPY assets/audio/rubik-turn-90.wav assets/audio/rubik-turn-180.wav ./assets/audio/

EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:7860/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
