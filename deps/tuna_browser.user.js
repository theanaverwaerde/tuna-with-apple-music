// ==UserScript==
// @name         Tuna browser script
// @namespace    univrsal
// @version      1.0.19
// @description  Get song information from web players, based on NowSniper by Kıraç Armağan Önal
// @author       univrsal
// @match        *://open.spotify.com/*
// @match        *://soundcloud.com/*
// @match        *://music.yandex.com/*
// @match        *://music.yandex.ru/*
// @match        *://www.deezer.com/*
// @match        *://play.pretzel.rocks/*
// @match        *://*.youtube.com/*
// @match        *://app.plex.tv/*
// @match        *://music.apple.com/*
// @grant        unsafeWindow
// @grant        GM.xmlHttpRequest
// @license      GPLv2
// ==/UserScript==

(function () {
    'use strict';
    console.log("Loading tuna browser script");

    // Configuration
    var port = 1608;
    var refresh_rate_ms = 500;
    var cooldown_ms = 10000;

    // Tuna isn't running we sleep, because every failed request will log into the console
    // so we don't want to spam it
    var failure_count = 0;
    var cooldown = 0;
    var last_state = {};

    function post(data, useGM = false) {
         if (data.status) {
            /* if this tab isn't playing and the status hasn't changed we don't send an update
             * otherwise tabs that are paused would constantly send the paused/stopped state
             * which interferes another tab that is playing something
             */
            if (data.status !== "playing" && last_state.status === data.status) {
                return; // Prevent the paused state from being continously sent, since this tab is not playing, should prevent tabs from clashing with eachother
            }
        }
        last_state = data;
        var url = 'http://localhost:' + port + '/';

        if(!useGM)
        {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', url);

            xhr.setRequestHeader('Accept', 'application/json');
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.setRequestHeader('Access-Control-Allow-Headers', '*');
            xhr.setRequestHeader('Access-Control-Allow-Origin', '*');

            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                    if (xhr.status !== 200) {
                        failure_count++;
                    }
                }
            };

            xhr.send(JSON.stringify({ data, hostname: window.location.hostname, date: Date.now() }));
        }
        else
        {
            GM.xmlHttpRequest({
                method: "POST",
                url: url,
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                data: JSON.stringify({ data, hostname: window.location.hostname, date: Date.now() }),
                onload: function(response) {
                    if (response.status !== 200) {
                        failure_count++;
                    }
                }
            });
        }
    }

    // Safely query something, and perform operations on it
    function query(target, fun, alt = null) {
        var element = document.querySelector(target);
        if (element !== null) {
            return fun(element);
        }
        return alt;
    }

    function timestamp_to_ms(ts) {
        var splits = ts.split(':');
        if (splits.length == 2) {
            return splits[0] * 60 * 1000 + splits[1] * 1000;
        } else if (splits.length == 3) {
            return splits[0] * 60 * 60 * 1000 + splits[1] * 60 * 1000 + splits[0] * 1000;
        }
        return 0;
    }

    function StartFunction() {
        setInterval(() => {
            if (failure_count > 3) {
                console.log('Failed to connect multiple times, waiting a few seconds');
                cooldown = cooldown_ms;
                failure_count = 0;
            }

            if (cooldown > 0) {
                cooldown -= refresh_rate_ms;
                return;
            }

            let hostname = window.location.hostname;
            // TODO: maybe add more?
            if (hostname === 'soundcloud.com') {
                let status = query('.playControl', e => e.classList.contains('playing') ? "playing" : "stopped", 'unknown');
                let cover = query('.playbackSoundBadge span.sc-artwork', e => e.style.backgroundImage.slice(5, -2).replace('t50x50', 't500x500'));
                let title = query('.playbackSoundBadge__titleLink', e => e.title);
                let artists = [query('.playbackSoundBadge__lightLink', e => e.title)];
                let progress = query('.playbackTimeline__timePassed span:nth-child(2)', e => timestamp_to_ms(e.textContent));
                let duration = query('.playbackTimeline__duration span:nth-child(2)', e => timestamp_to_ms(e.textContent));
                let album_url = query('.playbackSoundBadge__titleLink', e => e.href);
                let album = null;
                // this header only exists on album/set pages so we know this is a full album
                album = query('.fullListenHero .soundTitle__title', e => {
                    album_url = window.location.href;
                    return e.innerText
                })

                album = query('div.playlist.playing', e => {
                    return e.getElementsByClassName('soundTitle__title')[0].innerText;
                })

                if (title !== null) {
                    post({ cover, title, artists, status, progress, duration, album_url, album });
                }
            } else if (hostname === 'open.spotify.com') {
                let data = navigator.mediaSession;
                let album = data.metadata.album;
                let status = query('.vnCew8qzJq3cVGlYFXRI', e => e === null ? 'stopped' : (e.getAttribute('aria-label') === 'Play' ? 'stopped' : 'playing'));
                let cover = data.metadata.artwork[0].src;
                let title = data.metadata.title
                let artists = [data.metadata.artist]
                let progress = query('.playback-bar__progress-time-elapsed', e => timestamp_to_ms(e.textContent));
                let duration = query('.npFSJSO1wsu3mEEGb5bh', e => timestamp_to_ms(e.textContent));


                if (title !== null) {
                    post({ cover, title, artists, status, progress, duration, album });
                }
            } else if (hostname === 'music.yandex.ru') {
                // Yandex music support by MjKey
                let status = query('.player-controls__btn_play', e => e.classList.contains('player-controls__btn_pause') ? "playing" : "stopped", 'unknown');
                let cover = query('.track-cover .entity-cover__image', e => e.src.replace('50x50', '200x200'));
                let title = query('.track__title', e => e.title);
                let artists = [query('.track__artists', e => e.textContent)];
                let progress = query('.progress__left', e => timestamp_to_ms(e.textContent));
                let duration = query('.progress__right', e => timestamp_to_ms(e.textContent));
                let album_url = query('.track-cover a', e => e.title);

                if (title !== null) {
                    post({ cover, title, artists, status, progress, duration, album_url });
                }
            } else if (hostname === 'www.youtube.com') {
                if (!navigator.mediaSession.metadata) // if nothing is playing we don't submit anything, otherwise having two youtube tabs open causes issues
                    return;
                let artists = [];

                try {
                    artists = [document.querySelector('div#upload-info').querySelector('a').innerText.trim().replace("\n", "")];
                } catch (e) { }

                let title = query('.style-scope.ytd-video-primary-info-renderer', e => {
                    let t = e.getElementsByClassName('title');
                    if (t && t.length > 0)
                        return t[0].innerText;
                    return "";
                });
                let duration = query('video', e => e.duration * 1000);
                let progress = query('video', e => e.currentTime * 1000);
                let cover = "";
                let status = query('video', e => e.paused ? 'stopped' : 'playing', 'unknown');
                let regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
                let match = window.location.toString().match(regExp);
                if (match && match[2].length == 11) {
                    cover = `https://i.ytimg.com/vi/${match[2]}/maxresdefault.jpg`;
                }


                if (title !== null) {
                    title = title.replace(`${artists.join(", ")} - `, "");
                    title = title.replace(` - ${artists.join(", ")}`, "");
                    title = title.replace(`${artists.join(", ")}`, "");
                    title = title.replace("(Official Audio)", "");
                    title = title.replace("(Official Music Video)", "");
                    title = title.replace("(Original Video)", "");
                    title = title.replace("(Original Mix)", "");
                    if (status !== 'stopped') {
                        post({ cover, title, artists, status, progress: Math.floor(progress), duration });
                    } else {
                        post({ status: 'stopped', title: '', artists: [], progress: 0, duration: 0 });
                    }
                }
            } else if (hostname === 'music.youtube.com') {
                if (!navigator.mediaSession.metadata) // if nothing is playing we don't submit anything, otherwise having two youtube tabs open causes issues
                    return;
                // Youtube Music support by Rubecks
                const artistsSelectors = [
                    '.ytmusic-player-bar.byline [href*="channel/"]:not([href*="channel/MPREb_"]):not([href*="browse/MPREb_"])', // Artists with links
                    '.ytmusic-player-bar.byline .yt-formatted-string:nth-child(2n+1):not([href*="browse/"]):not([href*="channel/"]):not(:nth-last-child(1)):not(:nth-last-child(3))', // Artists without links
                    '.ytmusic-player-bar.byline [href*="browse/FEmusic_library_privately_owned_artist_detaila_"]', // Self uploaded music
                ];
                const albumSelectors = [
                    '.ytmusic-player-bar [href*="browse/MPREb_"]', // Albums from YTM with links
                    '.ytmusic-player-bar [href*="browse/FEmusic_library_privately_owned_release_detailb_"]', // Self uploaded music
                ];
                let time = query('.ytmusic-player-bar.time-info', e => e.innerText.split(" / "));

                let status = "unknown";
                if (document.querySelector(".ytmusic-player-bar.play-pause-button path[d^='M6 19h4V5H6v14zm8-14v14h4V5h-4z']")) {
                    status = "playing";
                }
                if (document.querySelector(".ytmusic-player-bar.play-pause-button path[d^='M8 5v14l11-7z']")) {
                    status = "stopped"
                }
                let title = query('.ytmusic-player-bar.title', e => e.title);
                let artists = Array.from(document.querySelectorAll(artistsSelectors)).map(x => x.innerText);
                let album = query(albumSelectors, e => e.textContent);
                let artwork = navigator.mediaSession.metadata.artwork;
                let cover = artwork[artwork.length - 1].src;
                let album_url = query(albumSelectors, e => e.href);
                let progress = timestamp_to_ms(time[0]);
                let duration = timestamp_to_ms(time[1]);
                if (title !== null) {
                    post({ cover, title, artists, status, progress, duration, album_url, album });
                }
            } else if (hostname === 'www.deezer.com') {
                let status = query('.chakra-button.css-8cy61', e => {
                    return e.getAttribute('aria-label').toLowerCase() === "play" ? "paused" : "playing";
                }, "stopped");

                if ("mediaSession" in navigator) {
                    let data = navigator.mediaSession;
                    let album = data.metadata.album;
                    let res = data.metadata.artwork[0].sizes;
                    let cover = data.metadata.artwork[0].src.replace(res, '512x512');
                    let title = data.metadata.title
                    let artists = data.metadata.artist.split(",").map(x => x.trim());
                    let progress_input = document.querySelector('input.slider-track-input.mousetrap');
                    let progress = Math.round(progress_input.value * 1000);
                    let duration = Math.round(progress_input.max * 1000);
                    if (title !== null) {
                        post({ cover, title, artists, status, progress, duration, album });
                    }
                }
            } else if (hostname === "play.pretzel.rocks") {
                // Pretzel.rocks support by Tarulia
                // Thanks to Rory from Pretzel for helping out :)

                let status = "unknown";

                if (document.querySelector("[data-testid=pause-button]")) {
                    status = "playing";
                }

                if (document.querySelector("[data-testid=play-button]")) {
                    status = "stopped";
                }

                let cover = query('[data-testid=track-artwork]', e => {
                    let img = e.getElementsByTagName('img');
                    if (img.length > 0) {
                        let src = img[0].src; // https://img.pretzel.rocks/artwork/9Mf8m9/medium.jpg
                        return src.replace('medium.jpg', 'large.jpg'); // https://img.pretzel.rocks/artwork/9Mf8m9/large.jpg
                    }
                    return null;
                });

                let title = query('[data-testid=title]', e => {
                    return e.textContent;
                });

                let artists = query('[data-testid=artist]', e => {
                    let elements = e.getElementsByTagName('a');
                    if (elements.length > 0) {
                        let artistArray = [];
                        for (let i = 0; i < elements.length; i++) {
                            artistArray.push(elements[i].textContent);
                        }
                        return artistArray;
                    }
                    return null;
                });

                let album = query('[data-testid=album]', e => {
                    return e.textContent;
                });

                let album_url = query('[data-testid=album]', e => {
                    return e.href;
                });

                let duration = query('[data-testid=track-progress-bar]', e => e.max * 1000);
                let progress = query('[data-testid=track-progress-bar]', e => e.value * 1000);

                if (title !== null) {
                    post({ cover, title, artists, status, progress, duration, album_url, album });
                }
            } else if (hostname === "app.plex.tv") {
                // simple plex web support by javaarchive
                // this is kind of more "universal" as it reads data from the browser media session api
                // see https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API for more info
                const mediaSessionStatesToTunaStates = {
                    "none": "unknown",
                    "playing": "playing",
                    "paused": "stopped"
                }
                let status = mediaSessionStatesToTunaStates[navigator.mediaSession.playbackState] || "unknown";
                if (navigator.mediaSession.metadata) {
                    let title = navigator.mediaSession.metadata.title;
                    let artists = [navigator.mediaSession.metadata.artist];

                    let mediaElem = document.getElementsByTagName("audio")[0]; // add || document.getElementsByTagName("video")[0] to support sites like yt music where video includes audio
                    let progress = Math.floor(mediaElem.currentTime) * 1000;
                    let duration = Math.floor(mediaElem.duration) * 1000;

                    let artworks = navigator.mediaSession.metadata.artwork;
                    let album = navigator.mediaSession.metadata.album;
                    let album_url = artworks[artworks.length - 1].src;
                    let cover = album_url; // For now.

                    if (title !== null) {
                        post({ cover, title, artists, status, progress, duration, album, album_url });
                    }
                }
            } else if (hostname === "music.apple.com") {
                // Apple music support by theoverwaerde
                let shadowRoot = document.querySelector("amp-lcd").shadowRoot;

                let status = query('.playback-play__play', e => e.getAttribute("aria-hidden") ? "playing" : "stopped", 'unknown');

                if (navigator.mediaSession.metadata) {
                    let title = navigator.mediaSession.metadata.title;
                    let artists = navigator.mediaSession.metadata.artist.split(", ");
                    let album = navigator.mediaSession.metadata.album;
                    let progress = shadowRoot.querySelector("#playback-progress").getAttribute("aria-valuenow") * 1000;
                    let duration = shadowRoot.querySelector("#playback-progress").getAttribute("max") * 1000;
                    let cover = shadowRoot.querySelector(".lcd__artwork-container.lcd__artwork > picture > img").src;
                    let end = cover.lastIndexOf("/");
                    cover = cover.substring(0, end) + "/512x512.jpg";

                    if (title !== null) {
                        post({ status, title, artists, progress, duration, album, cover }, true);
                    }
                }
            }
        }, refresh_rate_ms);

    }

    StartFunction();
})();
