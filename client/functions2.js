if (Meteor.isClient) {
    function ProgressiveImageSequence(imgpath, count, options) {
        var myself = this;

        var images = [];
        var numLoaded = 0;
        var isComplete = false;
        this.length = count;


        var defaultOptions = {
            indexSize: 4,
            initialStep: 8,
            onComplete: null,
            onProgress: null,
            stopAt: 1
        };
        var pref = {};
        $.extend(pref, defaultOptions, options);

        var step = pref.initialStep;
        var current = 0;
        var hasRestepped = false;

        function callback(f, o) {
            if ( !! f) f.apply(o);
        }

        this.stop = function() {
            step = pref.stopAt / 2;
        };

        this.reset = function() {
            isComplete = false;
            numLoaded = 0;
            step = pref.initialStep;
            current = 0;
            hasRestepped = false;
            this.nearestIndex = -1;
            $.each(images, function(k, v) { !! v && v.unload();
            });
        };

        this.getAt = function(index) {
            return images[index].image;
        };

        this.nearestIndex = -1;

        this.getNearest = function(index) {
            index = Math.floor(index);
            var diff = 0;
            var i, img;
            for (diff = 0; diff < images.length; diff++) {
                i = index + diff;
                if (i >= 0 && i < images.length) {
                    img = images[i];
                    if (img && img.isLoaded()) {
                        this.nearestIndex = i;
                        return img.image;
                    }
                }
                i = index - diff;
                if (i >= 0 && i < images.length) {
                    img = images[i];
                    if (img && img.isLoaded()) {
                        this.nearestIndex = i;
                        return img.image;
                    }
                }
            }
            return null;
        };




        // Loading

        this.getNumLoaded = function() {
            return numLoaded;
        };

        this.getLoadProgress = function() {
            return numLoaded * pref.stopAt / myself.length;
        };

        this.isLoaded = function(index) {
            if (index === undefined) {
                return numLoaded == myself.length;
            } else {
                return images[index].isLoaded();
            }
        };

        this.loadPosition = function(position, complete) {
            position = Math.min(1, Math.max(0, position));
            var index = position * (myself.length - 1);
            index = Math.round(index);
            myself.loadIndex(index, complete);
        };

        this.loadIndex = function(index, complete) {
            if (index < 0 ||  index >= myself.length) return false;

            if (index != Math.floor(index)) {
                return false;
            }

            //console.log( "Loading " + index + " ("+[current,step]+")" );

            var img = images[index];
            if (img == null) {
                var src = getSrcAt(index);
                img = new ImageLoader(src);
                images[index] = img;
            }
            img.load(function() {
                numLoaded++;
                if (!isComplete) {
                    callback(pref.onProgress, this);
                } else {
                    //console && console.log("On progress?");
                }
                callback(complete, this);
            });
        };

        this.loadNext = function(complete) {
            if (step < pref.stopAt) return; // in this case we've already loaded all images - other threads just don't know yet

            function next() {
                loadNextImage();
                callback(complete, this);
            }

            function end() {
                finished();
                callback(complete, this);
            }
            current += step;
            if (current >= myself.length) {
                if (hasRestepped) step /= 2;
                hasRestepped = true;
                current = step / 2;
                if (current >= pref.stopAt) {
                    myself.loadIndex(current, next);
                } else {
                    finished();
                }
            } else {
                myself.loadIndex(current, next);
            }
        };

        this.getImageLoader = function(index) {
            return images[index];
        };

        function loadNextImage() {
            setTimeout(function() {
                myself.loadNext();
                // }, $.browser.mozilla || $.browser.msie ? 50 : 5
            });
        }

        function finished() {
            isComplete = true;
            callback(pref.onComplete, this);
            //console.log( "All images loaded" , numLoaded, 'of', myself.length );
        }


        function getSrcAt(index) {
            var str = (index + 1 + Math.pow(10, pref.indexSize)).toString(10).substr(1);
            return imgpath.replace('{index}', str);
        }


        this.load = function() {
            myself.loadIndex(0, loadNextImage);
        }
    }



    function ImageLoader(src) {
        var elem = $('<img>');
        this.image = new Image();
        var img = this.image;
        var loadStarted = false;

        this.getSrc = function() {
            return src;
        };

        this.freeMemory = function() {
            // after loading the image
            // it will be in the browser cache
            // so we can garbage collect it
            // since we don't want to have 6100
            // images in memory (especially on a phone)
            this.image = {
                src: img.src,
                complete: true
            }
            img.src = '';
            img = this.image;
        }

        this.load = function(complete) {
            console.log('loading ', src);
            var self = this;
            loadStarted = true;
            img.src = src;
            if (img.complete) {
                complete.apply(img);
                this.freeMemory();
            } else {
                $(img).load(function() {
                    complete.apply(this, arguments);
                    self.freeMemory();
                });
            }
        };

        this.unload = function() {
            loadStarted = false;
            img.src = '';
            img = this.image = new Image();
        };

        this.isLoaded = function() {
            return loadStarted && img.complete;
        }
    }


    $(document).ready(function() {
        var $doc = $(document);
        var $win = $(window);

        // dimensions - we want to cache them on window resize
        var windowHeight, windowWidth;
        var fullHeight, scrollHeight;
        var streetImgWidth = 1440,
            streetImgHeight = 960;
        calculateDimensions();

        var currentPosition = -1,
            targetPosition = 0;
        var $videoContainer = $('.street-view');
        var video = $('.street-view > img')[0];
        var $hotspotElements = $('[data-position]');


        // handling resize and scroll events

        function calculateDimensions() {
            windowWidth = $win.width();
            windowHeight = $win.height();
            fullHeight = $('#main').height();
            scrollHeight = fullHeight - windowHeight;
        }

        function handleResize() {
            calculateDimensions();
            resizeBackgroundImage();
            handleScroll();
        }

        function handleScroll() {
            targetPosition = $win.scrollTop() / scrollHeight;
        }

        // main render loop
        window.requestAnimFrame = (function() {
            return window.requestAnimationFrame ||
                window.webkitRequestAnimationFrame ||
                window.mozRequestAnimationFrame ||
                window.oRequestAnimationFrame ||
                window.msRequestAnimationFrame ||
                function( /* function */ callback, /* DOMElement */ element) {
                    window.setTimeout(callback, 1000 / 60);
            };
        })();


        function animloop() {
            if (Math.floor(currentPosition * 5000) != Math.floor(targetPosition * 5000)) {
                currentPosition += (targetPosition - currentPosition) / 5;
                render(currentPosition);
            }
            requestAnimFrame(animloop);
        }






        // rendering


        function render(position) {
            // position the elements
            var minY = -windowHeight,
                maxY = windowHeight;
            $.each($hotspotElements, function(index, element) {
                var $hotspot = $(element);
                var elemPosition = Number($hotspot.attr('data-position'));
                var elemSpeed = Number($hotspot.attr('data-speed'));
                var elemY = windowHeight / 2 + elemSpeed * (elemPosition - position) * scrollHeight;
                if (elemY < minY || elemY > maxY) {
                    $hotspot.css({
                        'visiblity': 'none',
                        top: '-1000px',
                        'webkitTransform': 'none'
                    });
                } else {
                    $hotspot.css({
                        'visiblity': 'visible',
                        top: elemY,
                        position: 'fixed'
                    });
                }
            });


            renderVideo(position);
        }

        function resizeBackgroundImage() {
            // get image container size
            var scale = Math.max(windowHeight / streetImgHeight, windowWidth / streetImgWidth);
            var width = scale * streetImgWidth,
                height = scale * streetImgHeight;
            var left = (windowWidth - width) / 2,
                top = (windowHeight - height) / 2;
            $videoContainer
                .width(width).height(height)
                .css('position', 'fixed')
                .css('left', left + 'px')
                .css('top', top + 'px');
        }





        // video handling

        var imageSeqLoader = new ProgressiveImageSequence("../img/street_test/vid-{index}.jpg", 6191, {
            indexSize: 4,
            //how many images it loads when you scroll is initial step. it started at 24
            initialStep: 8,
            onProgress: handleLoadProgress,
            onComplete: handleLoadComplete,
            stopAt: 1
        });

        var loadCounterForIE = 0; // there seems to be a problem with ie calling the callback several times
        imageSeqLoader.loadPosition(currentPosition, function() {
            loadCounterForIE++;
            if (loadCounterForIE == 1) {
                renderVideo(currentPosition);
                imageSeqLoader.load();
                imageSeqLoader.load();
                imageSeqLoader.load();
                imageSeqLoader.load();
            }
        });


        var currentSrc, currentIndex;

        function renderVideo(position) {
            var index = Math.round(currentPosition * (imageSeqLoader.length - 1));
            var img = imageSeqLoader.getNearest(index);
            var nearestIndex = imageSeqLoader.nearestIndex;
            if (nearestIndex < 0) nearestIndex = 0;
            var $img = $(img);
            var src;
            if ( !! img) {
                src = img.src;
                if (src != currentSrc) {
                    video.src = src;
                    currentSrc = src;
                }
            }
        }



        $('body').append('<div id="loading-bar" style="top:1; left:0; background-color: #DF0012; background-color: rgba(223,0,18,0.5); height: 1px;"></div>');

        function handleLoadProgress() {
            var progress = imageSeqLoader.getLoadProgress() * 100;
            $('#loading-bar').css({
                width: progress + '%',
                opacity: 1
            });
        }

        function handleLoadComplete() {
            $('#loading-bar').css({
                width: '100%',
                opacity: 0
            });
        }




        $win.resize(handleResize);
        $win.scroll(handleScroll);

        handleResize();
        animloop();




    });

}