ep_users
===========

User-Management System for etherpad-lite

This is refactored & updated version of the unmaintained plugins for etherpad-lite:

* https://github.com/aoberegg/ep_user_pad
* https://github.com/aoberegg/ep_user_pad_frontend
* https://github.com/llttugraz/ep_user_pads

## IMPORTANT NOTE: currently in alpha

## Installation
You can clone directly into the node_modules directory of your Etherpad installation.

`git clone https://github.com/ffalt/ep_users.git`

`cd ep_users`

`npm install`

copy settings.json.template to settings.json

fill in your configuration in settings.json

restart etherpad-lite

## MySQL Tables

Tables are auto created on start if they not exists. If the pad database user doesn't have enough rights, you must import /sql/create_ep_tables.sql manually.

## Administrator User Management

<padurl>/admin/users/

## Settings

TODO: document settings

## TODO

* ~~ refactor duplicate code ~~
* ~~ sort code ~~
* ~~ implement password reset mail ~~
* implement sortable group & pad lists
* refactor sql schema (consistent column naming, etc.)
* translate client js string constants
