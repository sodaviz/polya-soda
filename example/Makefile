### build
### -----
### Build the example app such that TypeScript files are compiled
### to JavaScript and the example/ directory is bundled into a
### single asset to be consumed by example/index.html.
###

.PHONY: build
build: builddir build/index.html
	npx tsc --build tsconfig.json
	npx esbuild js/main.js --bundle --outfile=build/main.js
	npx pug-cli -P src/index.pug -o build/

### serve
### -----
### Build and serve the example app on port 8080.
###
.PHONY: serve
serve: build
	@echo "SERVE invoked at $$(date)"
	@echo "Running server on localhost:8080"
	@echo "Use ctrl-c to stop"
	@python3 -m http.server -d build/ -b localhost 8080 && echo "Bye bye!"

## ---------------
## Private Targets
## ---------------

builddir:
	mkdir -p build/

build/index.html: index.html
	cp index.html build/

## This lives way down here because it screws up the syntax highlighting
## for the rest of the file if it's higher up. Basically, we just grep
## the Makefile for special comments and barf out those lines.
MAGIC_COMMENT := \#\#\#
help:
	@cat Makefile | grep '^$(MAGIC_COMMENT)' | \
	sed 's/$(MAGIC_COMMENT) //' | sed 's/$(MAGIC_COMMENT)//' | less
