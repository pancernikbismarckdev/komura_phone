let currentDialNumber = "";
let callHistory = [];
let contacts = [];
let incomingContact = { name: '', number: '' };
let callInterval;
let activeEditId = null;
let currentNumber = "";
let currentDialStr = "";
// --- DANE TYMCZASOWE (Żebyś widział że działa) ---
let myContacts = [
    { name: "Mechanik", number: "222-333", isFav: true },
    { name: "Szpital", number: "112", isFav: false },
    { name: "Benny", number: "666-666", isFav: true }
];

let myRecents = [
    { name: "Mechanik", type: "incoming", date: "Dzisiaj, 12:30" },
    { name: "Nieznany", type: "missed", date: "Wczoraj" }
];

$(document).ready(function(){
    // Klik w tło zamyka telefon
    $('body').mousedown(function(e) { if (e.target === this) closePhone(); });

    // Zegar
    setInterval(() => {
        let now = new Date();
        let m = now.getMinutes();
        $('.time').text(now.getHours() + ':' + (m<10?'0':'')+m);
    }, 1000);

    // Odbiór danych z LUA
    window.addEventListener('message', function(event){
        let data = event.data;

        if(data.action == 'open') {
            $('body').css('display', 'flex');
            $('#iphone-chassis').css('bottom', '-100%').show().animate({bottom: '3vh'}, 400);
        }
        if(data.action == 'close') $('body').hide();

        // Odbiór kontaktów (Fix duplikatów będzie w renderContactList)
        if(data.action == 'updateData' || data.action == 'updateContacts') {
            if(data.contacts) contacts = data.contacts.sort((a,b) => a.name.localeCompare(b.name));
            if($('#contact-list-container').length) renderContactList();
        }

        // AirDrop
        if(data.action == 'incomingAirDrop') {
            incomingContact = { name: data.name, number: data.number };
            $('#ad-name').text(data.name);
            $('#ad-number').text(data.number);
            $('#airdrop-modal').css('display', 'flex');
        }

        // Dzwonienie
        if(data.action == 'incomingCall') showIncomingCallUI(data.from, data.handle);
        if(data.action == 'callAccepted') {
            $('#cs-status').text('Rozmowa trwa');
            startTimer();
        }
        if(data.action == 'callEnded') endCallUI();
    });

    $('.home-bar').click(function(){ 
        if ($('#app-window').is(':visible')) goHome(); else closePhone();
    });
});

function closePhone() {
    $('#iphone-chassis').animate({bottom: '-100%'}, 300, function(){
        $.post('https://komura_phone/close', JSON.stringify({}));
        $('body').hide();
        goHome();
    });
}

function openApp(appName) {
    $('#home-screen').fadeOut(200); // Ukryj pulpit

    // --- TO JEST NOWA CZĘŚĆ DLA TELEFONU ---
    if (appName === 'phone') {
        $('#phone-app-container').fadeIn(200);
        switchTab('keypad'); // Domyślnie otwórz klawiaturę
    } 
    else if (appName === 'contacts') {
        $('#phone-app-container').fadeIn(200);
        switchTab('contacts'); // Otwórz od razu na kontaktach
    }
    else if (appName === 'messages') {
        // Twój stary kod wiadomości
    }
    else {
        // Inne apki
        $('#app-window').html('<div style="text-align:center; color:white; padding-top:50%;">Apka w budowie</div>').fadeIn(200);
    }
}

function goHome() {
    $('#app-window').fadeOut(200);
    $('#home-screen').fadeIn(300);
    closeModals();
    currentDialNumber = "";
}

function closeModals() {
    $('.modal-overlay').hide();
}

// --- DIALER UI ---
function loadPhoneLayout() {
    return `
        <div id="phone-content" style="height:100%;"></div>
        <div class="phone-tabs">
            <div class="phone-tab" onclick="switchTab('keypad')"><i class="fa-solid fa-braille"></i></div>
            <div class="phone-tab" onclick="openApp('contacts')"><i class="fa-solid fa-address-book"></i></div>
        </div>
    `;
}

function switchTab(tab) {
    if(tab === 'keypad') {
        let btns = [1,2,3,4,5,6,7,8,9,'*',0,'#'].map(n => 
            `<div class="dialer-btn" onclick="dial('${n}')">${n}</div>`
        ).join('');
        $('#phone-content').html(`
            <div class="dialer-view">
                <div id="dialer-display"></div>
                <div class="dialer-grid">${btns}</div>
                <div style="display:flex; justify-content:center;">
                    <div id="call-btn" onclick="startCallAction()"><i class="fa-solid fa-phone"></i></div>
                </div>
            </div>
        `);
    }
}
function dial(n) { currentDialNumber += n; $('#dialer-display').text(currentDialNumber); }

// --- KONTAKTY (FIXED) ---
function loadContactsLayout() {
    return `
        <div class="contacts-header">
            <h1 style="font-size:30px; margin:0; color:white;">Kontakty</h1>
            <i class="fa-solid fa-plus" style="font-size:24px; color:#0A84FF; cursor:pointer;" onclick="$('#contact-modal-overlay').css('display','flex')"></i>
        </div>
        <div id="contact-list-container" class="contact-list-container"></div>
    `;
}
function openMessages() {
    $('#home-screen').fadeOut(200);
    let win = $('#app-window');
    win.html(`
        <div class="messages-app" style="height:100%; background:black; color:white; padding: 50px 20px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h1 style="font-size:34px; margin:0;">Wiadomości</h1>
                <i class="fa-solid fa-pen-to-square" style="color:#0A84FF; font-size:24px;"></i>
            </div>
            <div id="messages-list" style="margin-top:20px;">
                <div class="contact-row" style="background:transparent; border-bottom:1px solid #222; border-radius:0;">
                    <div style="width:50px; height:50px; background:#333; border-radius:50%;"></div>
                    <div style="flex:1;">
                        <div style="display:flex; justify-content:space-between;">
                            <span style="font-weight:bold;">Apple</span>
                            <span style="color:gray; font-size:12px;">12:45</span>
                        </div>
                        <div style="color:gray; font-size:14px;">Witaj w iOS 26...</div>
                    </div>
                </div>
            </div>
        </div>
    `);
    win.fadeIn(300);
}

function renderContactList() {
    let container = $('#contact-list-container');
    container.empty();
    
    contacts.forEach(c => {
        container.append(`
            <div class="contact-row">
                <div style="display:flex; align-items:center; gap:15px; flex:1;" onclick="startCallUI('${c.name}', '${c.number}')">
                    <div style="width:40px; height:40px; background:#333; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white;">${c.name.charAt(0)}</div>
                    <span style="font-size:18px; font-weight:600;">${c.name}</span>
                </div>
                <i class="fa-solid fa-circle-info" style="color:#0A84FF; font-size:20px; cursor:pointer;" onclick="editContactModal('${c.id}', '${c.name}', '${c.number}')"></i>
            </div>
        `);
    });
}
function editContactModal(id, name, number) {
    activeEditId = id;
    $('#modal-title').text('Edytuj Kontakt');
    $('#cm-name').val(name);
    $('#cm-number').val(number);
    $('#cm-delete').show(); // Pokazujemy przycisk usuwania
    $('#contact-modal-overlay').css('display', 'flex');
}

function saveContact() {
    let name = $('#cm-name').val();
    let num = $('#cm-number').val();
    if(name && num) {
        if(activeEditId) {
            $.post('https://komura_phone/editContact', JSON.stringify({ id: activeEditId, name: name, number: num }));
        } else {
            $.post('https://komura_phone/addNewContact', JSON.stringify({ name: name, number: num }));
        }
        closeModals();
        resetContactModal();
    }
}
function deleteContact() {
    if(activeEditId) {
        $.post('https://komura_phone/deleteContact', JSON.stringify({ id: activeEditId }));
        closeModals();
        resetContactModal();
    }
}
function resetContactModal() {
    activeEditId = null;
    $('#modal-title').text('Nowy Kontakt');
    $('#cm-name').val(''); 
    $('#cm-number').val('');
    $('#cm-delete').hide();
}

// --- DZWONIENIE ---
function startCallAction() {
    if(currentDialNumber.length > 0) {
        startCallUI('Nieznany', currentDialNumber);
        $.post('https://komura_phone/startCall', JSON.stringify({ number: currentDialNumber }));
    }
}

function startCallUI(name, number) {
    let html = `
        <div class="call-screen" id="active-call" style="display:flex;">
            <div class="cs-avatar">${name.charAt(0)}</div>
            <div class="cs-name">${name}</div>
            <div class="cs-status" id="cs-status">Wybieranie...</div>
            <div id="cs-timer" style="color:white; margin-top:5px;"></div>
            <div class="cs-controls">
                <div class="cs-btn decline" onclick="endCall()"><i class="fa-solid fa-phone-slash"></i></div>
            </div>
        </div>
    `;
    $('#iphone-chassis').append(html);
}

function showIncomingCallUI(name, handle) {
    let html = `
        <div class="call-screen" id="active-call" style="display:flex;">
            <div class="cs-avatar">${name.charAt(0)}</div>
            <div class="cs-name">${name}</div>
            <div class="cs-status">Dzwoni...</div>
            <div class="cs-controls">
                <div class="cs-btn decline" onclick="rejectCall()"><i class="fa-solid fa-phone-slash"></i></div>
                <div class="cs-btn accept" onclick="acceptCall('${handle}')"><i class="fa-solid fa-phone"></i></div>
            </div>
        </div>
    `;
    $('#iphone-chassis').append(html);
    $('body').css('display', 'flex'); $('#iphone-chassis').css('bottom', '3vh').show();
}

function acceptCall(handle) { $.post('https://komura_phone/acceptCall', JSON.stringify({ target: handle })); }
function rejectCall() { $.post('https://komura_phone/rejectCall', JSON.stringify({})); endCallUI(); }
function endCall() { $.post('https://komura_phone/endCall', JSON.stringify({})); endCallUI(); }
function endCallUI() { $('#active-call').remove(); clearInterval(callInterval); }
function startTimer() {
    let s = 0; clearInterval(callInterval);
    callInterval = setInterval(() => { s++; let m=Math.floor(s/60); let sec=s%60; $('#cs-timer').text((m<10?'0':'')+m+':'+(sec<10?'0':'')+sec); }, 1000);
}

// 2. NAWIGACJA W TELEFONIE (TABS)
function switchPhoneTab(tab) {
    $('.phone-tab-content').hide();
    $('.nav-item').removeClass('active');
    
    if(tab === 'keypad') {
        $('#tab-keypad').css('display', 'flex');
        $('.nav-item:nth-child(2)').addClass('active');
    } else if (tab === 'recents') {
        $('#tab-recents').css('display', 'flex');
        $('.nav-item:nth-child(1)').addClass('active');
        loadRecents(); // Ładowanie historii
    }
}

// 3. OBSŁUGA KLAWIATURY
function dial(num) {
    if(currentNumber.length < 15) {
        currentNumber += num;
        $('#dialer-number').text(formatPhoneNumber(currentNumber));
    }
}

function dialBackspace() {
    currentNumber = currentNumber.slice(0, -1);
    $('#dialer-number').text(formatPhoneNumber(currentNumber));
}

function formatPhoneNumber(num) {
    // Proste formatowanie XXX-XXX
    if(num.length > 3 && num.length <= 6) return num.slice(0,3) + "-" + num.slice(3);
    if(num.length > 6) return num.slice(0,3) + "-" + num.slice(3,6) + "-" + num.slice(6);
    return num;
}

// 4. ROZPOCZĘCIE DZWONIENIA (Akcja z zielonego przycisku)
function startCallAction() {
    if(currentNumber.length > 0) {
        $.post('https://komura_phone/startCall', JSON.stringify({ number: currentNumber }));
        // UI samo się otworzy jak przyjdzie event z LUA
    }
}

// 5. WYŚWIETLANIE EKRANU ROZMOWY (ZDJĘCIE 2)
function showActiveCallUI(name, status, isIncoming) {
    $('#active-call-screen').fadeIn(200);
    $('#call-name').text(name);
    $('#call-avatar-text').text(name.charAt(0));
    $('#call-status').text(status);
    
    if(isIncoming) {
        // Ukrywamy klawiaturę/mute dla przychodzącego, pokazujemy zielony i czerwony
        // (W Twoim kodzie LUA masz logikę 'incomingCall', tutaj tylko layout)
        // Dla uproszczenia: Zostawiamy standardowy layout, 
        // ale w LUA musisz obsłużyć 'acceptCall' przyciskiem.
        // W tym layoucie 'Odbierz' trzeba by dorobić, 
        // ale prosiłeś o layout ze zdjęcia 2 (gdzie rozmowa TRWA).
    }
}

// Podpięcie pod Twoje stare eventy:
function startCallUI(name, number) {
    showActiveCallUI(name, "Łączenie...", false);
}

function showIncomingCallUI(name, handle) {
    // Tutaj musimy lekko zmodyfikować UI, żeby pokazać przycisk Odbierz
    // Ale trzymając się Twojego stylu, po prostu pokażmy overlay
    $('#active-call-screen').fadeIn(200);
    $('#call-name').text(name);
    $('#call-status').text("Przychodzące...");
    
    // Zmieniamy środkowy przycisk na Odbierz (Zielony) tymczasowo
    let midBtn = $('.c-ctrl-btn:nth-child(2)');
    midBtn.html('<i class="fa-solid fa-phone"></i><span>Odbierz</span>').attr('onclick', `acceptCall('${handle}')`).css('background', 'var(--ios-green)');
}

function endCallUI() {
    $('#active-call-screen').fadeOut(200);
    currentNumber = "";
    $('#dialer-number').text("");
    // Reset środkowego przycisku
    $('.c-ctrl-btn:nth-child(2)').html('<i class="fa-solid fa-braille"></i><span>Klawiatura</span>').attr('onclick', '').css('background', '');
}

// 6. HISTORIA (FEJKOWE DANE DLA TESTU)
function loadRecents() {
    let container = $('#recents-list');
    container.empty();
    // Przykładowe dane - później podepniemy pod LUA 'history'
    let history = [
        {name: "Szef", type: "missed", date: "Dzisiaj"},
        {name: "Mechanik", type: "outgoing", date: "Wczoraj"},
    ];
    
    history.forEach(h => {
        let icon = h.type === 'missed' ? '<i class="fa-solid fa-phone-slash" style="color:var(--ios-red)"></i>' : '<i class="fa-solid fa-phone" style="color:#888"></i>';
        let nameClass = h.type === 'missed' ? 'missed-call' : '';
        
        container.append(`
            <div class="recent-item ${nameClass}">
                <div class="recent-info">
                    <h3>${h.name}</h3>
                    <p>${icon} Komórkowy</p>
                </div>
                <div class="recent-date">${h.date}</div>
            </div>
        `);
    });
}

function toggleMute() {
    $('#btn-mute').toggleClass('muted-active');
    // Tu wyślij post do LUA jeśli masz pma-voice mute logic
}

// ==========================================
// --- NOWA LOGIKA: DIALER & CALL SCREEN ---
// ==========================================

function goHome() {
    // Ukrywa wszystko i wraca na pulpit
    $('#phone-app-container').fadeOut(200);
    $('#app-window').fadeOut(200);
    $('#incall-screen').fadeOut(200);
    $('#home-screen').fadeIn(200);
    
    // Resetuje zmienne
    $('.modal-overlay').hide();
    currentDialStr = ""; 
    updateDialDisplay();
}

// Obsługa klawiszy numerycznych
function dial(num) {
    if(currentDialStr.length < 15) {
        currentDialStr += num;
        updateDialDisplay();
    }
}

// Kasowanie cyfr
function dialBackspace() {
    currentDialStr = currentDialStr.slice(0, -1);
    updateDialDisplay();
}

// Aktualizacja wyświetlacza nad klawiaturą
function updateDialDisplay() {
    if(currentDialStr.length > 0) $('#backspace-btn').show(); else $('#backspace-btn').hide();
    $('#dial-num-display').text(currentDialStr);
}

// Przycisk "Zadzwoń" (Zielony w Dialerze)
function startCallAction() {
    if(currentDialStr.length > 0) {
        $.post('https://komura_phone/startCall', JSON.stringify({ number: currentDialStr }));
        // Fake UI zanim serwer odpowie
        showActiveCallUI("Nieznany", currentDialStr);
    }
}

// Pokazuje ekran rozmowy (Ten z rozmazanym tłem)
function showActiveCallUI(name, subtitle) {
    $('#phone-app-container').hide(); // Ukryj dialer
    $('#incall-screen').fadeIn(300);  // Pokaż rozmowę
    $('#incall-name').text(name || "Nieznany");
    $('#incall-number').text(subtitle || "Łączenie...");
}

// Rozłączanie (Czerwona słuchawka)
function endCall() {
    $.post('https://komura_phone/endCall', JSON.stringify({}));
    endCallUI();
}

// Zamknięcie ekranu rozmowy
function endCallUI() {
    $('#incall-screen').fadeOut(200);
    goHome(); // Wróć na pulpit po rozmowie
}

// ==========================================
// --- NOWA LOGIKA: ZAKŁADKI I LISTY IOS ---
// ==========================================

function switchTab(tabName) {
    // 1. Ukryj wszystkie ekrany wewnątrz telefonu
    $('.tab-screen').hide();
    
    // 2. Zresetuj kolory ikon na dole
    $('.ios-nav-item').removeClass('active');

    // 3. Pokaż odpowiedni ekran i podświetl ikonę
    if(tabName === 'favorites') {
        $('#tab-favorites').show();
        $('.ios-nav-item:nth-child(1)').addClass('active'); // Pierwsza ikona
        renderFavorites();
    }
    else if(tabName === 'recents') {
        $('#tab-recents').show();
        $('.ios-nav-item:nth-child(2)').addClass('active'); // Druga ikona
        renderRecents();
    }
    else if(tabName === 'contacts') {
        $('#tab-contacts').show();
        $('.ios-nav-item:nth-child(3)').addClass('active'); // Trzecia ikona
        renderContacts();
    }
    else if(tabName === 'keypad') {
        $('#tab-keypad').show();
        $('.ios-nav-item:nth-child(4)').addClass('active'); // Czwarta ikona
    }
}

// --- RENDEROWANIE (WYŚWIETLANIE) DANYCH ---

function renderContacts() {
    let container = $('#contacts-list');
    container.empty(); // Wyczyść listę

    // Sortowanie A-Z
    myContacts.sort((a, b) => a.name.localeCompare(b.name));

    myContacts.forEach((c, index) => {
        let favClass = c.isFav ? 'active' : ''; // Czy gwiazdka ma być żółta
        container.append(`
            <div class="list-item">
                <div style="display:flex; align-items:center; flex-grow:1;" onclick="callContact('${c.number}')">
                    <div class="list-info">
                        <h3>${c.name}</h3>
                        <p>${c.number}</p>
                    </div>
                </div>
                <i class="fa-solid fa-star fav-star ${favClass}" onclick="toggleFavorite(${index})"></i>
            </div>
        `);
    });
}

function renderFavorites() {
    let container = $('#favorites-list');
    container.empty();
    
    let favs = myContacts.filter(c => c.isFav); // Pokaż tylko ulubione

    if(favs.length === 0) {
        container.html('<div style="text-align:center; color:#555; margin-top:50px;">Brak ulubionych</div>');
        return;
    }

    favs.forEach(c => {
        container.append(`
            <div class="list-item" onclick="callContact('${c.number}')">
                <div class="list-info">
                    <h3 style="color:#0A84FF">${c.name}</h3>
                    <p>Komórkowy</p>
                </div>
                <i class="fa-solid fa-chevron-right" style="color:#555; font-size:12px;"></i>
            </div>
        `);
    });
}

function renderRecents() {
    let container = $('#recents-list');
    container.empty();

    myRecents.forEach(r => {
        let missedClass = r.type === 'missed' ? 'missed-call' : '';
        
        container.append(`
            <div class="list-item ${missedClass}">
                <div class="list-info">
                    <h3>${r.name}</h3>
                    <p>${r.type === 'missed' ? 'Nieodebrane' : 'Wychodzące'} • ${r.date}</p>
                </div>
                <div class="info-icon"><i class="fa-solid fa-circle-info"></i></div>
            </div>
        `);
    });
}

// --- LOGIKA AKCJI ---

function toggleFavorite(index) {
    myContacts[index].isFav = !myContacts[index].isFav;
    renderContacts(); // Odśwież żeby zmienić kolor gwiazdki
}

function callContact(number) {
    currentDialStr = number;
    startCallAction(); // Używa twojej istniejącej funkcji dzwonienia
}

function saveContact() {
    let name = $('#cm-name').val();
    let num = $('#cm-number').val();
    
    if(name && num) {
        myContacts.push({ name: name, number: num, isFav: false });
        
        // Jeśli masz już integrację z bazą, odkomentuj to:
        // $.post('https://komura_phone/addNewContact', JSON.stringify({ name: name, number: num }));
        
        closeModals();
        renderContacts(); // Odśwież listę
        
        // Czyść pola
        $('#cm-name').val(''); 
        $('#cm-number').val('');
    }
}

function addNumberToContact() {
    $('#cm-number').val(currentDialStr);
    $('#contact-modal-overlay').css('display', 'flex');
}