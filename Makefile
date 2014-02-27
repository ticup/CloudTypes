REPORTER = spec


test:
	browserify test/client/main.js -o test/client/bundle.js; \
	browserify client/main.js -o client/bundle.js; \
	./node_modules/.bin/mocha \
		--reporter $(REPORTER) \
		--ui bdd \
		test/*.js

compile:
	browserify test/client/main.js -o test/client/bundle.js; \
	browserify client/main.js -o client/bundle.js;


.PHONY: test