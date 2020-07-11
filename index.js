const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const ObjectId = require('mongoose').Types.ObjectId;
const multer  = require('multer')
const uniqueString  = require('unique-string')
const fs  = require('fs')

const app = express();
app.use(bodyParser.json({extended: true}));
mongoose.connect('mongodb://localhost:27017/books', {useNewUrlParser: true, useUnifiedTopology: true});
mongoose.set('useFindAndModify', false);

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, __dirname + '/covers')
    },
    filename: function (req, file, cb) {
        cb(null, uniqueString() + '.png')
    }
})
const upload = multer({ storage: storage })

const bookSchema = new mongoose.Schema({
    type: String,

    recommendation: String,
    state: String,
    starred: Boolean,

    rootTitle: String,
    title: String,
    authors: String,
    coverUrl: String,
    edition: Number,
    publisher: String,
    publishedYear: Number,
    pagesNumber: Number,

    category: String,
    subCategory: String,
    tags: [String],

    sources: [{name: String, location: String}],

    note: String,
    description: String
});
const Book = mongoose.model('Book', bookSchema);

app.get('/books', function(req, res){
    Book.find(function (err, books) {
        if (err) return console.error(err);
        res.send(books.map(mapBookForReturn));
    })
});

app.get('/filter-books', function(req, res){
    console.log('xxx');
    console.log(req.query.marked);
    console.log(req.query.marked.indexOf('false'));
    const conditions = {
        recommendation: {$in: getArrayOf(req.query.recommendation)},
        state: {$in: getArrayOf(req.query.state)},
        starred: {$in: getArrayOf(req.query.marked)},
        type: {$in: getArrayOf(req.query.type)},
    }
    Book.find(conditions, function (err, books) {
        if (err) return console.error(err);
        res.send(books.map(mapBookForReturn));
    })
});

getArrayOf = function(queryParams) {
    if (queryParams === null || queryParams === undefined) {
        return [];
    }
    return typeof queryParams === 'string' ? [queryParams] : Array.from(queryParams);
}

app.get('/books/:bookId', function(req, res){
    Book.findById(req.params.bookId, function (err, book) {
        if (err) return console.error(err);
        res.send(mapBookForReturn(book));
    })
});

mapBookForReturn = function(book) {
    return {
        id: book._id,
        type: book.type, recommendation: book.recommendation, state: book.state, starred: book.starred,
        rootTitle: book.rootTitle, title: book.title,
        authors: book.authors,
        coverUrl: book.coverUrl,
        edition: book.edition, publisher: book.publisher, publishedYear: book.publishedYear, pagesNumber: book.pagesNumber,
        category: book.category, subCategory: book.subCategory,
        tags: book.tags,
        sources: book.sources ? book.sources.map(source => new Object({name: source.name, location: source.location})) : [],
        note: book.note,
        description: book.description
    }
}

mapBookForUpdate = function(book) {
    return {
        type: book.type, recommendation: book.recommendation, state: book.state, starred: book.starred,
        rootTitle: book.rootTitle, title: book.title,
        authors: book.authors,
        coverUrl: book.coverUrl,
        edition: book.edition, publisher: book.publisher, publishedYear: book.publishedYear, pagesNumber: book.pagesNumber,
        category: book.category, subCategory: book.subCategory,
        tags: book.tags,
        sources: book.sources ? book.sources.map(source => new Object({name: source.name, location: source.location})) : [],
        note: book.note,
        description: book.description
    }
}

app.post('/books', upload.single('cover'), function (req, res, next) {
    const book = new Book(JSON.parse(req.body.book));
    book.coverUrl = 'api/books/cover/' + req.file.filename;
    book.save().then(() => res.status(200).end()).catch(()=> res.send("error"));
});

app.put('/books/:bookId', upload.single('cover'), async function(req, res, next) {
    const bookToUpdate = mapBookForUpdate(new Book(JSON.parse(req.body.book)));
    console.log(bookToUpdate);
    if (req.file) {
        removeCoverOfBook(req.params.bookId)
        bookToUpdate.coverUrl = 'api/books/cover/' + req.file.filename;
    }
    Book.findOneAndUpdate({_id: new ObjectId(req.params.bookId)}, bookToUpdate, function (err, book) {
        if (err) return res.send(err);
        res.status(200).end();
    })
});

removeCoverOfBook = async function(bookId) {
    await Book.findById(req.params.bookId, function (err, bookOld) {
        if (err) return console.error(err);
        if (bookOld.coverUrl) {
            fs.unlinkSync(__dirname + '/covers/' + bookOld.coverUrl.split('/')[3]);
        }
    })
}

app.get('/books/cover/:coverId', function(req, res){
    res.sendFile(__dirname + '/covers/' + req.params.coverId);
});

app.get('/tags', function(req, res) {
    Book.find({}, 'tags', function(err, books) {
        if (err) return console.error(err);
        const tagsSet = books.reduce((tags, book) => {book.tags.forEach(tags.add, tags);return tags;}, new Set())
        const tagsToReturn = [...tagsSet].sort();
        res.send(tagsToReturn);
    });
})

app.listen(3001, function() {
    console.log("server has started on port 3001");
});
