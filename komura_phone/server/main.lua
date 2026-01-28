-- server/main.lua
local ESX = exports['es_extended']:getSharedObject()

-- FUNKCJA POMOCNICZA: Znajdź numer w ekwipunku
function GetActiveSimNumber(source)
    -- Szukamy slotów z kartami SIM
    local simItems = exports.ox_inventory:Search(source, 'slots', 'sim_card')
    if simItems then
        for _, item in pairs(simItems) do
            if item.metadata and item.metadata.phone_number then
                return item.metadata.phone_number
            end
        end
    end
    
    -- Opcjonalnie: sprawdź sam telefon (jeśli numer jest przypisany do urządzenia)
    local phoneItems = exports.ox_inventory:Search(source, 'slots', 'phone')
    if phoneItems then
        for _, item in pairs(phoneItems) do
            if item.metadata and item.metadata.phone_number then
                return item.metadata.phone_number
            end
        end
    end

    return nil
end

-- EXPORT DLA OX_INVENTORY (Użycie przedmiotu)
exports('usePhone', function(event, item, inventory, slot, data)
    local src = inventory.id
    local phoneNumber = GetActiveSimNumber(src)

    if phoneNumber then
        TriggerClientEvent('komura:openPhone', src, phoneNumber)
    else
        TriggerClientEvent('ox_lib:notify', src, {type = 'error', description = 'Brak aktywnej karty SIM!'})
    end
end)

-- KOMENDA AWARYJNA /phone
RegisterNetEvent('komura:tryOpenPhone', function()
    local src = source
    local hasPhone = exports.ox_inventory:GetItemCount(src, 'phone') > 0
    
    if hasPhone then
        local phoneNumber = GetActiveSimNumber(src)
        if phoneNumber then
            TriggerClientEvent('komura:openPhone', src, phoneNumber)
        else
            TriggerClientEvent('ox_lib:notify', src, {type = 'error', description = 'Włóż kartę SIM!'})
        end
    else
        TriggerClientEvent('ox_lib:notify', src, {type = 'error', description = 'Nie masz telefonu!'})
    end
end)

-- LOGIKA DZWONIENIA (Routing PMA-Voice)
local function getSourceByNumber(number)
    local players = ESX.GetPlayers()
    -- UWAGA: Pętla po wszystkich graczach może być obciążająca przy 300+ osobach.
    -- W przyszłości warto to zoptymalizować (np. cache numerów przy wejściu na serwer).
    for _, src in pairs(players) do
        local foundNum = GetActiveSimNumber(src)
        if foundNum == number then
            return src
        end
    end
    return nil
end

RegisterNetEvent('komura:startCallServer', function(targetNumber)
    local src = source
    local xPlayer = ESX.GetPlayerFromId(src)
    
    -- Zabezpieczenie: Czy dzwoniący ma w ogóle telefon/sim?
    local mySimCount = exports.ox_inventory:Search(src, 'count', 'sim_card')
    if mySimCount == 0 then
        TriggerClientEvent('ox_lib:notify', src, {type = 'error', description = 'Nie masz karty SIM!'})
        return
    end

    -- Pobieramy metadane karty dzwoniącego (jego numer)
    local items = exports.ox_inventory:Search(src, 'slots', 'sim_card')
    local myNumber = items[1].metadata.phone_number or "Nieznany"

    -- Szukamy gracza docelowego (Target)
    local targetSrc = nil
    local players = ESX.GetPlayers()

    for _, playerId in ipairs(players) do
        -- Sprawdzamy czy gracz ma w EQ simkę z tym konkretnym numerem
        -- search(source, type, item, metadata)
        local count = exports.ox_inventory:Search(playerId, 'count', 'sim_card', {phone_number = targetNumber})
        
        if count > 0 then
            targetSrc = playerId
            break
        end
    end

    -- Weryfikacja wyniku
    if targetSrc then
        if targetSrc == src then
            TriggerClientEvent('ox_lib:notify', src, {type = 'error', description = 'Nie możesz dzwonić do siebie (zajęte)'})
            TriggerClientEvent('komura:callEndedClient', src)
        else
            -- Znaleziono gracza! Dzwonimy do niego.
            -- Zapisujemy w pamięci serwera, kto z kim gada (żeby potem wiedzieć kogo rozłączyć)
            -- Używamy StateBags lub prostej tablicy. Tu prosta tablica dla czytelności:
            Entity(GetPlayerPed(src)).state.isInCallWith = targetSrc
            Entity(GetPlayerPed(targetSrc)).state.isInCallWith = src
            
            -- Wysyłamy sygnał do odbiorcy: "Ktoś dzwoni!"
            -- Przekazujemy numer dzwoniącego (myNumber)
            TriggerClientEvent('komura:incomingCall', targetSrc, myNumber, "Nieznany", src)
            
            -- Informacja dla dzwoniącego (np. sygnał łączenia)
            TriggerClientEvent('ox_lib:notify', src, {type = 'info', description = 'Dzwonienie...'})
        end
    else
        -- Nikt online nie ma takiej karty SIM
        TriggerClientEvent('ox_lib:notify', src, {type = 'error', description = 'Numer niedostępny lub poza zasięgiem'})
        TriggerClientEvent('komura:callEndedClient', src) -- Rozłącz UI dzwoniącego
    end
end)

RegisterNetEvent('komura:acceptCallServer', function(callerSrc)
    local src = source -- To jest osoba odbierająca
    local target = tonumber(callerSrc) -- To jest osoba, która dzwoniła

    if target and GetPlayerPing(target) > 0 then
        -- Generujemy unikalny kanał głosowy (np. losowa liczba + ID gracza)
        local callChannel = math.random(10000, 99999)

        -- Podłączamy obu graczy do PMA-VOICE
        TriggerClientEvent('komura:startCallVoice', src, callChannel)
        TriggerClientEvent('komura:startCallVoice', target, callChannel)

        -- Powiadomienie
        TriggerClientEvent('ox_lib:notify', src, {type = 'success', description = 'Rozmowa rozpoczęta'})
        TriggerClientEvent('ox_lib:notify', target, {type = 'success', description = 'Rozmowa odebrana'})
    else
        TriggerClientEvent('ox_lib:notify', src, {type = 'error', description = 'Dzwoniący się rozłączył'})
        TriggerClientEvent('komura:callEndedClient', src)
    end
end)

RegisterNetEvent('komura:endCallServer', function()
    local src = source
    
    -- Sprawdzamy z kim gadał ten gracz (z StateBaga ustawionego w pkt 1)
    local targetSrc = Entity(GetPlayerPed(src)).state.isInCallWith

    -- Czyścimy stan dzwoniącego
    Entity(GetPlayerPed(src)).state.isInCallWith = nil

    -- Rozłączamy dzwoniącego (siebie)
    TriggerClientEvent('komura:callEndedClient', src)

    -- Jeśli była druga osoba, też ją rozłączamy
    if targetSrc and GetPlayerPing(targetSrc) > 0 then
        Entity(GetPlayerPed(targetSrc)).state.isInCallWith = nil
        TriggerClientEvent('komura:callEndedClient', targetSrc)
        TriggerClientEvent('ox_lib:notify', targetSrc, {type = 'info', description = 'Rozmowa zakończona'})
    end
end)

RegisterNetEvent('komura:rejectCallServer', function()
    -- To samo co EndCall, ale z komunikatem "Zajęte"
    local src = source
    local targetSrc = Entity(GetPlayerPed(src)).state.isInCallWith
    
    if targetSrc and GetPlayerPing(targetSrc) > 0 then
        TriggerClientEvent('komura:callEndedClient', targetSrc)
        TriggerClientEvent('ox_lib:notify', targetSrc, {type = 'error', description = 'Abonent odrzucił połączenie'})
        Entity(GetPlayerPed(targetSrc)).state.isInCallWith = nil
    end
    
    Entity(GetPlayerPed(src)).state.isInCallWith = nil
    TriggerClientEvent('komura:callEndedClient', src)
end)

-- --- SKLEP Z KARTAMI SIM (SERVER) ---

RegisterNetEvent('komura:buySimCard', function()
    local src = source
    local xPlayer = ESX.GetPlayerFromId(src)
    local price = 50 -- Cena startera
    
    if xPlayer.getMoney() >= price then
        -- 1. Generujemy numer i sprawdzamy czy jest wolny w bazie
        local isUnique = false
        local fullNumber = nil
        
        while not isUnique do
            local randomNum = math.random(1000, 9999)
            fullNumber = '555-' .. randomNum
            
            -- Sprawdzamy w bazie czy numer istnieje (synchronicznie dla pewności)
            local result = MySQL.scalar.await('SELECT count(*) FROM komura_sim_cards WHERE phone_number = ?', {fullNumber})
            if result == 0 then
                isUnique = true
            end
            Wait(10) -- Krótka pauza dla bezpieczeństwa pętli
        end

        -- 2. Zabieramy kasę
        xPlayer.removeMoney(price)

        -- 3. Rejestrujemy numer w bazie (Dzięki temu zapiszemy tu tapetę itp.)
        MySQL.insert('INSERT INTO komura_sim_cards (phone_number, owner) VALUES (?, ?)', {
            fullNumber, 
            xPlayer.identifier
        }, function(id)
            -- 4. Dopiero jak baza potwierdzi, dajemy przedmiot do OX Inventory
            if exports.ox_inventory:CanCarryItem(src, 'sim_card', 1) then
                exports.ox_inventory:AddItem(src, 'sim_card', 1, {
                    phone_number = fullNumber,
                    description = 'Numer: ' .. fullNumber
                })
                
                TriggerClientEvent('ox_lib:notify', src, {
                    type = 'success', 
                    description = 'Kupiono i zarejestrowano numer: ' .. fullNumber
                })
            else
                -- Jak nie ma miejsca, oddaj kasę i usuń z bazy (rollback)
                xPlayer.addMoney(price)
                MySQL.query('DELETE FROM komura_sim_cards WHERE phone_number = ?', {fullNumber})
                TriggerClientEvent('ox_lib:notify', src, {type = 'error', description = 'Brak miejsca w kieszeniach!'})
            end
        end)
        
    else
        TriggerClientEvent('ox_lib:notify', src, {type = 'error', description = 'Nie masz wystarczająco gotówki ($'..price..')'})
    end
end)