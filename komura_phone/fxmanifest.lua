fx_version 'cerulean'
game 'gta5'
lua54 'yes'

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/style.css',
    'html/script.js',
    'html/apps/*.js'
}

shared_scripts {
    '@es_extended/imports.lua',
    '@ox_lib/init.lua',
    'config.lua',
    '@oxmysql/lib/MySQL.lua'
}

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server/main.lua',
    'server/apps/*.lua',
    'server/apps/airdrop.lua'
}

client_scripts {
    'client/main.lua',
    'client/apps/airdrop.lua'
}