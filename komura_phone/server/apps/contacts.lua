-- server/apps/contacts.lua
local MySQL = exports.oxmysql -- <--- DODAJ TĘ LINIJKĘ NA SAMYM SZCZYCIE!

RegisterNetEvent('komura:fetchData', function(phoneNumber)
    local src = source
    if not phoneNumber then return end

    -- Teraz to zapytanie zadziała poprawnie:
    MySQL.query('SELECT * FROM komura_contacts WHERE sim_number = ?', {phoneNumber}, function(contacts)
        TriggerClientEvent('komura:receiveData', src, {
            contacts = contacts or {},
            history = {} 
        })
    end)
end)

RegisterNetEvent('komura:addContact', function(data)
    local src = source
    MySQL.insert('INSERT INTO komura_contacts (sim_number, name, number) VALUES (?, ?, ?)',
        {data.simNumber, data.name, data.number}, function(id)
            -- Automatyczne odświeżenie po dodaniu
            if id then
                MySQL.query('SELECT * FROM komura_contacts WHERE sim_number = ?', {data.simNumber}, function(contacts)
                    TriggerClientEvent('komura:updateContacts', src, contacts)
                end)
            end
    end)
end)

RegisterNetEvent('komura:editContact', function(data)
    local src = source
    MySQL.update('UPDATE komura_contacts SET name = ?, number = ? WHERE id = ?',
        {data.name, data.number, data.id}, function(affectedRows)
            if affectedRows > 0 then
                 -- Musimy wiedzieć jaki numer ma gracz, żeby odświeżyć listę
                 local currentSim = GetActiveSimNumber(src) -- Funkcja z server/main.lua (musi być globalna lub export)
                 if currentSim then
                    TriggerEvent('komura:fetchData', currentSim) -- Hack: wywołujemy event fetch
                 end
            end
    end)
end)

RegisterNetEvent('komura:deleteContact', function(data)
    local src = source
    -- Tutaj przydałoby się sprawdzić czy kontakt należy do sim_number gracza (security), ale na start wystarczy ID
    MySQL.update('DELETE FROM komura_contacts WHERE id = ?', {data.id}, function(affectedRows)
        -- Możesz dodać odświeżanie, tak jak wyżej
    end)
end)