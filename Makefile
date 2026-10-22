.PHONY: test build verify

test:
	npm test

build:
	npm run build

verify: test build
