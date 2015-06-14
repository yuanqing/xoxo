'use strict';

var del = require('del');
var gulp = require('gulp');
var http = require('http');
var nopt = require('nopt');
var sass = require('gulp-sass');
var openBrowser = require('open');
var ecstatic = require('ecstatic');
var concat = require('gulp-concat');
var jshint = require('gulp-jshint');
var rename = require('gulp-rename');
var uglify = require('gulp-uglify');
var minifycss = require('gulp-minify-css');
var sourcemaps = require('gulp-sourcemaps');
var autoprefixer = require('gulp-autoprefixer');

var paths = {
  dist: 'dist',
  vendor: [
    'bower_components/angular-youtube-mb/src/angular-youtube-embed.js',
    'bower_components/autosize-input/autosize-input.js',
    'bower_components/jockey/jockey.js',
    'bower_components/js-deflate/rawdeflate.js',
    'bower_components/js-deflate/rawinflate.js',
    'bower_components/js-base64/base64.js',
    'bower_components/Sortable/Sortable.js'
  ],
  js: [
    'js/app.js',
    'js/Factory/*.js',
    'js/Directive/*.js',
    'js/Controller/*.js'
  ],
  css: [
    'css/*.scss'
  ]
};

var knownOpts = {
  open: Boolean
};
var shortHands = {
  o: '--open'
};

// DEFAULT

gulp.task('default', ['serve']);

// DIST

gulp.task('dist', ['js', 'css']);

// CLEAN

gulp.task('clean', function(cb) {
  del(paths.dist, cb);
});

// WATCH

var watch = function() {
  gulp.watch(paths.js, ['js']);
  gulp.watch(paths.css, ['css']);
};
gulp.task('watch', ['dist'], watch);

// SERVE

gulp.task('serve', ['dist'], function() {
  http.createServer(ecstatic({
    root: '.'
  })).listen(8888);
  watch();
  var opts = nopt(knownOpts, shortHands);
  if (opts.open) {
    openBrowser('http://localhost:8888/');
  }
});

// JS

gulp.task('jshint', function() {
  return gulp.src(paths.js.concat(__filename))
    .pipe(jshint());
});

gulp.task('js', ['jshint'], function() {
  return gulp.src(paths.vendor.concat(paths.js))
    .pipe(sourcemaps.init())
    .pipe(concat('script.js'))
    .pipe(sourcemaps.write())
    .pipe(gulp.dest(paths.dist))
    .pipe(rename({ suffix: '.min' }))
    .pipe(uglify())
    .pipe(gulp.dest(paths.dist));
});

// CSS

gulp.task('css', function () {
  return gulp.src(paths.css)
    .pipe(sourcemaps.init())
    .pipe(sass())
    .pipe(concat('style.css'))
    .pipe(autoprefixer({ browsers: ['last 2 versions'], cascade: false }))
    .pipe(sourcemaps.write())
    .pipe(gulp.dest(paths.dist))
    .pipe(rename({ suffix: '.min' }))
    .pipe(minifycss())
    .pipe(gulp.dest(paths.dist));
});
