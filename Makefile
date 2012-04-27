BUNDLE_LOC="dev_bundle"
BIN=dev_bundle/lib/node_modules/expresso/bin/expresso
BIN_DEVBUNDLE=admin/generate-dev-bundle.sh
BUNDLE_TAR=dev_bundle_Linux*.gz
TESTS=`find test/ -type f -name "*.test.js"`

test: $(BIN)
	@./$(BIN) --growl $(TEST_FLAGS) $(TESTS)

test-cov:
	@./$(BIN) -I lib --cov $(TEST_FLAGS) $(TESTS) 

build:
	mkdir -p $(BUNDLE_LOC)
	@./$(BIN_DEVBUNDLE)
	mv  $(BUNDLE_LOC)/

extract:
	tar -xf $(BUNDLE_LOC)/$(BUNDLE_TAR) -C $(BUNDLE_LOC)/

devbuild: build extract

.PHONY: test test-cov build extract