local isPhoneOpen = false
local currentSimNumber = nil

-- EVENT OTWIERANIA
RegisterNetEvent('komura:openPhone', function(phoneNumber)
    if isPhoneOpen then return end
    isPhoneOpen = true
    currentSimNumber = phoneNumber
    
    local ped = PlayerPedId()
    RequestAnimDict('cellphone@')
    while not HasAnimDictLoaded('cellphone@') do Wait(0) end
    
    TaskPlayAnim(ped, 'cellphone@', 'cellphone_text_in', 8.0, -8.0, -1, 50, 0, false, false, false)
    
    -- 1. Pozwalamy grze odbierać sygnały (żeby działało chodzenie)
    SetNuiFocus(true, true)
    SetNuiFocusKeepInput(true) 
    
    SendNUIMessage({
        action = 'open', 
        hasSim = true, 
        phoneNumber = phoneNumber
    })
    
    TriggerServerEvent('komura:fetchData', phoneNumber)

    -- 2. Pętla blokująca TYLKO kamerę i bicie, pozwalająca chodzić
    CreateThread(function()
        while isPhoneOpen do
            -- Blokujemy rozglądanie się myszką (Kamera)
            DisableControlAction(0, 1, true) -- LookLeftRight
            DisableControlAction(0, 2, true) -- LookUpDown
            
            -- Blokujemy bicie i celowanie (żeby nie uderzyć kogoś klikając w apkę)
            DisableControlAction(0, 24, true) -- Attack
            DisableControlAction(0, 257, true) -- Attack 2
            DisableControlAction(0, 25, true) -- Aim
            DisableControlAction(0, 263, true) -- Melee Attack 1

            -- Blokujemy kucanie (opcjonalne, ale wygodne przy telefonie)
            DisableControlAction(0, 36, true) -- Duck

            Wait(0)
        end
    end)
end)

-- EVENT ZAMYKANIA
RegisterNUICallback('close', function(data, cb)
    isPhoneOpen = false -- To zatrzyma pętlę blokującą kamerę
    
    SetNuiFocus(false, false)
    SetNuiFocusKeepInput(false)
    
    local ped = PlayerPedId()
    TaskPlayAnim(ped, 'cellphone@', 'cellphone_text_out', 8.0, -8.0, -1, 50, 0, false, false, false)
    Wait(1000)
    StopAnimTask(ped, 'cellphone@', 'cellphone_text_out', 1.0)
    
    cb('ok')
end)

-- KOMENDA /phone
RegisterCommand('phone', function()
    if not isPhoneOpen then 
        TriggerServerEvent('komura:tryOpenPhone') 
    end
end)

-- ODBIERANIE DANYCH
RegisterNetEvent('komura:receiveData', function(data)
    SendNUIMessage({ action = 'updateData', contacts = data.contacts, history = data.history })
end)

RegisterNetEvent('komura:updateContacts', function(contacts)
    SendNUIMessage({ action = 'updateContacts', contacts = contacts })
end)

-- DZWONIENIE
RegisterNUICallback('startCall', function(data, cb)
    TriggerServerEvent('komura:startCallServer', data.number)
    cb('ok')
end)

RegisterNetEvent('komura:incomingCall', function(fromNumber, fromName, targetSrc)
    if not isPhoneOpen then
        -- Jeśli telefon zamknięty, otwórz go przy dzwonieniu z tymi samymi zasadami (chodzenie tak, kamera nie)
        isPhoneOpen = true
        SetNuiFocus(true, true)
        SetNuiFocusKeepInput(true)
        
        -- Kopia pętli blokującej dla przychodzącego połączenia
        CreateThread(function()
            while isPhoneOpen do
                DisableControlAction(0, 1, true)
                DisableControlAction(0, 2, true)
                DisableControlAction(0, 24, true)
                DisableControlAction(0, 257, true)
                DisableControlAction(0, 25, true)
                DisableControlAction(0, 263, true)
                Wait(0)
            end
        end)
        
        SendNUIMessage({ action = 'open', hasSim = true })
    end
    
    SendNUIMessage({ action = 'incomingCall', from = fromName or fromNumber, handle = targetSrc })
    PlaySoundFrontend(-1, "Phone_Ring_Generic", "Phone_SoundSet_Default", 1)
end)

RegisterNUICallback('acceptCall', function(data, cb)
    TriggerServerEvent('komura:acceptCallServer', data.target)
    cb('ok')
end)

RegisterNetEvent('komura:startCallVoice', function(channel)
    -- Podłączenie pod radio/kanał głosowy
    exports['pma-voice']:setCallChannel(channel)
    -- Info do JS żeby zmienił ekran na "Trwa rozmowa"
    SendNUIMessage({ action = 'callAccepted' })
end)

RegisterNUICallback('endCall', function(data, cb)
    exports['pma-voice']:removePlayerFromCall()
    TriggerServerEvent('komura:endCallServer')
    cb('ok')
end)

RegisterNetEvent('komura:callEndedClient', function()
    exports['pma-voice']:removePlayerFromCall()
    SendNUIMessage({ action = 'callEnded' })
end)

RegisterNUICallback('rejectCall', function(data, cb)
    TriggerServerEvent('komura:rejectCallServer')
    cb('ok')
end)

-- KONTAKTY UI
RegisterNUICallback('addNewContact', function(data, cb)
    if not currentSimNumber then return end
    TriggerServerEvent('komura:addContact', { simNumber = currentSimNumber, name = data.name, number = data.number })
    cb('ok')
end)

RegisterNUICallback('editContact', function(data, cb)
    TriggerServerEvent('komura:editContact', data)
    cb('ok')
end)

RegisterNUICallback('deleteContact', function(data, cb)
    TriggerServerEvent('komura:deleteContact', data)
    cb('ok')
end)

-- --- SKLEP Z KARTAMI SIM (CLIENT) ---

CreateThread(function()
    -- KONFIGURACJA PEDA
    local pedModel = `a_m_y_business_03` -- Wygląd NPC
    local coords = vector4(-1082.2491, -247.6408, 37.7632, 208.8246) -- Koordynaty (Digital Den)
    
    -- Ładowanie modelu
    RequestModel(pedModel)
    while not HasModelLoaded(pedModel) do Wait(0) end

    -- Tworzenie NPC
    local shopPed = CreatePed(4, pedModel, coords.x, coords.y, coords.z, coords.w, false, true)
    FreezeEntityPosition(shopPed, true) -- Nie rusza się
    SetEntityInvincible(shopPed, true) -- Nieśmiertelny
    SetBlockingOfNonTemporaryEvents(shopPed, true) -- Ignoruje strzały/gracza

    -- Dodanie interakcji (OX_TARGET)
    exports.ox_target:addLocalEntity(shopPed, {
        {
            name = 'buy_sim_card',
            icon = 'fa-solid fa-sim-card',
            label = 'Kup starter SIM ($50)',
            onSelect = function()
                TriggerServerEvent('komura:buySimCard')
            end
        }
    })
end)