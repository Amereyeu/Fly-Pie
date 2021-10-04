SHELL := /bin/bash

JS_FILES = $(shell find -type f -and \( -name "*.js" \))
UI_FILES = $(shell find -type f -and \( -name "*.ui" \))

LOCALES_PO = $(wildcard po/*.po)
LOCALES_MO = $(patsubst po/%.po,locale/%/LC_MESSAGES/flypie.mo,$(LOCALES_PO))


.PHONY: build release install uninstall all-po pot clean

build: flypie@schneegans.github.com.zip

release: flypie@schneegans.github.com.zip
	@#Check if the zip size is too big to be uploaded
	@if [[ "$$(stat -c %s flypie@schneegans.github.com.zip)" -gt 4096000 ]]; then \
	  echo "ERROR! The extension is too big to be uploaded to the extensions website, keep it smaller than 4096 KB!"; exit 1; \
	fi

install: flypie@schneegans.github.com.zip
	gnome-extensions install "flypie@schneegans.github.com.zip" --force
	@echo "Extension installed successfully! Now restart the Shell ('Alt'+'F2', then 'r')."

uninstall:
	gnome-extensions uninstall "flypie@schneegans.github.com"

all-po: $(LOCALES_PO)

pot: $(JS_FILES) $(UI_FILES)
	@echo "Generating 'flypie.pot'..."
	@xgettext --from-code=UTF-8 \
			  --add-comments=Translators \
			  --copyright-holder="Simon Schneegans" \
			  --package-name="Fly-Pie" \
			  --output=po/flypie.pot \
			  $(JS_FILES) $(UI_FILES)
	@sed -i '1s/.*/# <LANGUAGE> translation for the Fly-Pie GNOME Shell Extension./' po/flypie.pot
	@sed -i "2s/.*/# Copyright (C) $$(date +%Y) Simon Schneegans/" po/flypie.pot
	@sed -i "4s/.*/# <FIRSTNAME LASTNAME <EMAIL@ADDRESS>, $$(date +%Y)./" po/flypie.pot
	@sed -i '12s/.*/"PO-Revision-Date: <YYYY-MM-DD> <HM:MM+TIMEZONE>\\n"/' po/flypie.pot
	@sed -i '14s/.*/"Language-Team: \\n"/' po/flypie.pot
	@sed -i '15s/.*/"Language: <LANGUAGE_CODE>\\n"/' po/flypie.pot

clean:
	rm -rf \
	flypie@schneegans.github.com.zip \
	resources/flypie.gresource \
	schemas/gschemas.compiled \
	locale \
	ui/*.ui~ \
	po/*.po~

flypie@schneegans.github.com.zip: schemas/gschemas.compiled resources/flypie.gresource.xml $(JS_FILES) $(LOCALES_MO)
	@echo "Compiling resources..."
	@glib-compile-resources --sourcedir="resources" --generate resources/flypie.gresource.xml

	@# Check if the VERSION variable was passed and set version to it
	@if [[ "$(VERSION)" != "" ]]; then \
	  sed -i "s|  \"version\":.*|  \"version\": $(VERSION)|g" metadata.json; \
	fi
	@# TODO Maybe echo version number of the release that was built, in order to facilitate double-checking before publishing it?
	
	@echo "Packing zip file..."
	@rm --force flypie@schneegans.github.com.zip
	@zip -r flypie@schneegans.github.com.zip -- src presets resources/flypie.gresource schemas/gschemas.compiled $(LOCALES_MO) *.js metadata.json LICENSE

schemas/gschemas.compiled: schemas/org.gnome.shell.extensions.flypie.gschema.xml
	@echo "Compiling schemas..."
	@glib-compile-schemas schemas

locale/%/LC_MESSAGES/flypie.mo: po/%.po
	@echo "Compiling $@"
	@mkdir -p locale/$*/LC_MESSAGES
	@msgfmt -c -o $@ $<

po/%.po:
	@echo "Updating $@"
	msgmerge --previous --update $@ po/flypie.pot
	@# Output translation progress
	@msgfmt --check --verbose --output-file=/dev/null $@
