.PHONY: dev

dev:
	@trap 'kill 0' INT; \
	(cd BulkCLI && python3 server.py) & \
	(cd frontend && npm run dev) & \
	wait
