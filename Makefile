clean:
	rm -rf node_modules docs build
docs:
	docco ./**/*.js

install: clean docs
	npm install

test:
	jasmine-node ./test/ --forceexit

.PHONY: clean install docs test
