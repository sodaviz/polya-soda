.PHONY: build
build:
	@echo "Building polya-soda..."
	rm -rf dist/
	cd src && npx tsc --build tsconfig-src.json
