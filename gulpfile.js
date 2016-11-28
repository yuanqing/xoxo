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
var htmlmin = require('gulp-htmlmin');
var minifyCss = require('gulp-minify-css');
var sourcemaps = require('gulp-sourcemaps');
var autoprefixer = require('gulp-autoprefixer');

var paths = {
  dist: 'dist',
  vendor: [
    'node_modules/angular-youtube-embed/src/angular-youtube-embed.js',
    'node_modules/autosize-input/autosize-input.js',
    'node_modules/jockey/jockey.js',
    'node_modules/js-base64/base64.js',
    'node_modules/sortablejs/Sortable.js',
    'vendor/js-deflate/rawdeflate.js',
    'vendor/js-deflate/rawinflate.js'
  ],
  html: 'html/index.html',
  js: [
    'js/app.js',
    'js/Factory/*.js',
    'js/Directive/*.js',
    'js/Controller/*.js'
  ],
  css: [
    'css/*.scss'
  ],
};

// DEFAULT

gulp.task('default', ['serve']);

// DIST

gulp.task('dist', ['js', 'css', 'html']);

// CLEAN

gulp.task('clean', function(cb) {
  return del(paths.dist);
});

// WATCH

var watch = function() {
  gulp.watch(paths.html, ['html']);
  gulp.watch(paths.js, ['js']);
  gulp.watch(paths.css, ['css']);
};
gulp.task('watch', ['dist'], watch);

// SERVE

var knownOpts = {
  open: Boolean
};
var shortHands = {
  o: '--open'
};

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

// HTML

gulp.task('html', function() {
  return gulp.src(paths.html)
    .pipe(htmlmin({
      collapseWhitespace: true,
      minifyJS: true
    }))
    .pipe(gulp.dest('./'));
});

// JS

gulp.task('jshint', function() {
  return gulp.src(paths.js.concat(__filename))
    .pipe(jshint());
});

gulp.task('js', ['jshint'], function() {
  return gulp.src(paths.vendor.concat(paths.js))
    .pipe(sourcemaps.init())
    .pipe(concat('script.js', {newLine: ';'}))
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
    .pipe(minifyCss())
    .pipe(gulp.dest(paths.dist));
});
