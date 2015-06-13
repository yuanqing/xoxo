# XOXO

> A [YouTube](https://youtube.com) mixtape maker thing powered by [AngularJS](https://angularjs.org).

## [Demo](http://goo.gl/ol1jEe)

## Features

- Repeating and shuffling
- Drag-and-drop reordering
- Inline renaming of tracks
- No back-end; persists playlist information in the URL hash

## Usage

To build and run the app locally, do:

```
$ git clone https://github.com/yuanqing/xoxo
$ cd xoxo
$ npm i
$ bower i
$ npm start
```

Then pull up [localhost:8888](http://localhost:8888/).

## TODO

- Write some [tests](https://github.com/angular/protractor) :beetle:
- The track reordering (using [Sortable](https://github.com/RubaXa/Sortable)) is a bit wonky, maybe try [Dragula](https://github.com/bevacqua/dragula)

## License

[MIT](LICENSE)
