﻿(function () {

    function vlcRenderer(options) {

        var self = this;

        self.enableProgressReporting = options.type == 'audio';

        function onEnded() {
            Events.trigger(self, 'ended');
        }

        function onTimeUpdate() {
            Events.trigger(self, 'timeupdate');
        }

        function onVolumeChange() {
            Events.trigger(self, 'volumechange');
        }

        function onPlaying() {
            Events.trigger(self, 'playing');
        }

        function onPlay() {
            Events.trigger(self, 'play');
        }

        function onPause() {
            Events.trigger(self, 'pause');
        }

        function onClick() {
            Events.trigger(self, 'click');
        }

        function onDblClick() {
            Events.trigger(self, 'dblclick');
        }

        function onError() {

            var errorCode = this.error ? this.error.code : '';
            Logger.log('Media element error code: ' + errorCode);

            Events.trigger(self, 'error');
        }

        var playerState = {};

        self.currentTime = function (val) {

            if (val != null) {
                AndroidVlcPlayer.sendVlcCommand("setposition", val.toString());
                return;
            }

            return playerState.currentTime;
        };

        self.duration = function (val) {

            if (playerState) {
                return playerState.duration;
            }

            return null;
        };

        self.stop = function () {
            AndroidVlcPlayer.sendVlcCommand("stop", null);
        };

        self.pause = function () {
            AndroidVlcPlayer.sendVlcCommand("pause", null);
        };

        self.unpause = function () {
            AndroidVlcPlayer.sendVlcCommand("unpause", null);
        };

        self.volume = function (val) {
            if (playerState) {
                if (val != null) {
                    AndroidVlcPlayer.sendVlcCommand("setvolume", (val * 100).toString());
                    return;
                }

                return playerState.volume;
            }
        };

        function getPlaybackStartInfoForVideoActivity(videoUrl, mediaSource, item) {

            var state = {
                PlayState: {}
            };

            var audioStreamIndex = getParameterByName('AudioStreamIndex', videoUrl);

            if (audioStreamIndex) {
                state.PlayState.AudioStreamIndex = parseInt(audioStreamIndex);
            }
            state.PlayState.SubtitleStreamIndex = self.currentSubtitleStreamIndex;

            state.PlayState.PlayMethod = getParameterByName('static', videoUrl) == 'true' ?
                'DirectStream' :
                'Transcode';

            state.PlayState.LiveStreamId = getParameterByName('LiveStreamId', videoUrl);
            state.PlayState.PlaySessionId = getParameterByName('PlaySessionId', videoUrl);

            state.PlayState.MediaSourceId = mediaSource.Id;

            state.NowPlayingItem = {
                RunTimeTicks: mediaSource.RunTimeTicks
            };

            state.PlayState.CanSeek = mediaSource.RunTimeTicks && mediaSource.RunTimeTicks > 0;

            var playbackStartInfo = {
                QueueableMediaTypes: item.MediaType,
                ItemId: item.Id,
                NowPlayingItem: state.NowPlayingItem
            };

            return $.extend(playbackStartInfo, state.PlayState);
        }

        self.setCurrentSrc = function (val, item, mediaSource, tracks) {

            if (!val) {
                self.destroy();
                return;
            }

            var tIndex = val.indexOf('#t=');
            var startPosMs = 0;

            if (tIndex != -1) {
                startPosMs = val.substring(tIndex + 3);
                startPosMs = parseFloat(startPosMs) * 1000;
            }

            if (options.type == 'audio') {

                AndroidVlcPlayer.playAudioVlc(val, JSON.stringify(item), JSON.stringify(mediaSource), options.poster);
            } else {

                var playbackStartInfo = getPlaybackStartInfoForVideoActivity(val, mediaSource, item);

                var serverUrl = ApiClient.serverAddress();

                var videoStream = mediaSource.MediaStreams.filter(function (stream) {
                    return stream.Type == "Video";
                })[0];
                var videoWidth = videoStream ? videoStream.Width : null;
                var videoHeight = videoStream ? videoStream.Height : null;

                var videoQualityOptions = MediaPlayer.getVideoQualityOptions(videoWidth, videoHeight).map(function (o) {
                    return {
                        Name: o.name,
                        Value: o.bitrate + "-" + o.maxHeight
                    };
                });

                var deviceProfile = MediaPlayer.getDeviceProfile();

                AndroidVlcPlayer.playVideoVlc(val,
                    startPosMs,
                    item.Name,
                    JSON.stringify(mediaSource),
                    JSON.stringify(playbackStartInfo),
                    ApiClient.serverInfo().Id,
                    serverUrl,
                    ApiClient.appName(),
                    ApiClient.appVersion(),
                    ApiClient.deviceId(),
                    ApiClient.deviceName(),
                    ApiClient.getCurrentUserId(),
                    ApiClient.accessToken(),
                    JSON.stringify(deviceProfile),
                    JSON.stringify(videoQualityOptions));

                playerState.currentSrc = val;
                self.report('playing', null, startPosMs, false, 100);

                playerState.currentSrc = val;
            }
        };

        self.currentSrc = function () {
            if (playerState) {
                return playerState.currentSrc;
            }
        };

        self.paused = function () {

            if (playerState) {
                return playerState.paused;
            }

            return false;
        };

        self.cleanup = function (destroyRenderer) {

            if (destroyRenderer !== false) {
                AndroidVlcPlayer.destroyVlc();
            }

            playerState = {};
        };

        self.enableCustomVideoControls = function () {

            return false;
        };

        self.report = function (eventName, duration, position, isPaused, volume) {

            var state = playerState;

            state.duration = duration;
            state.currentTime = position;
            state.paused = isPaused;
            state.volume = (volume || 0) / 100;

            if (eventName == 'playbackstop') {
                onEnded();
            }
            else if (eventName == 'volumechange') {
                onVolumeChange();
            }
            else if (eventName == 'positionchange') {
                onTimeUpdate();
            }
            else if (eventName == 'paused') {
                onPause();
            }
            else if (eventName == 'unpaused') {
                onPlaying();
            }
            else if (eventName == 'playing') {
                onPlaying();
            }
        };

        self.init = function () {

            var deferred = DeferredBuilder.Deferred();
            deferred.resolve();
            return deferred.promise();
        };

        self.onActivityClosed = function (wasStopped, hasError, endPositionMs, currentSrc) {

            playerState.currentTime = endPositionMs;

            if (currentSrc) {
                playerState.currentSrc = currentSrc;
            }

            if (wasStopped) {
                MediaPlayer.stop(false);
            }

            self.report('playbackstop', playerState.duration, endPositionMs, false, 100);
        };

        window.AudioRenderer.Current = self;
        window.VideoRenderer.Current = self;
    }

    window.AudioRenderer = function (options) {
        options = options || {};
        options.type = 'audio';

        return new vlcRenderer(options);
    };

    window.VideoRenderer = function (options) {
        options = options || {};
        options.type = 'video';

        return new vlcRenderer(options);
    };

})();