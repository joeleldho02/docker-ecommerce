const Userdb = require('../model/userModel');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({path:'.env'});
const client = require('twilio')(process.env.TWILIO_ACCOUNTSID, process.env.TWILIO_AUTHTOKEN);
const paymentHelper = require('../helper/razorpay'); 

async function setSession(req, res, userData){
    try{         
            delete req.session.signupEmail;
            delete req.session.signupPhone;
            delete req.session.loginErrMsg;
            delete req.session.loginOTP;
            delete req.session.loginErr;
            delete req.session.registeredUser;
            req.session.userLoggedIn = true;
            req.session.user = userData;
            console.log(`User Logged in Succesfully : ${userData.firstName + userData.lastName}`);
            console.log("FROM :--> " + req.session.returnTo);
            res.redirect(req.session.returnTo || '/')
            delete res.session.returnTo;
    } catch(err){
        res.status(500).render('error', {
            message: "Unable to get userdata from database",
            errStatus : 500
        });
        console.log(err);
    }
}
async function sendOTP(phone){
    try{
        let generatedOtp = Math.floor(100000 + Math.random() * 900000);
        const hashedOtp = await bcrypt.hash(String(generatedOtp), 10);
        console.log(`Generated OTP : ${generatedOtp}`)
    //-------------------- TWILIO OTP SENDER CODE ---------------------//
        client.messages.create({
            body: `JMJ Music House - OTP for Login is ${generatedOtp}`,
            from: '+17626002830',
            to: phone //to: phone ---> send to user phone number
        })
        .catch(err=>console.log(err));
        
        return hashedOtp;
    } catch(err){
        console.log("Unable to send OTP. Please try again later" + err);
    }
}

//User signup after email duplicate check and then add to db
exports.registerUser = async (req, res) => {
    try{
        console.log(req.body);
        if (!req.body) {
            console.log("No body submitted");
            res.redirect('/user/login');
        }
        else {
            await Userdb.findOne({ email: req.body.email })
                .then(async user => {
                    if (user !== null) {
                        console.log("User already exsits!");    
                        res.render('user-signup', {
                            signupErr: "Oops..!! User with entered email ID already exsits.",
                            inputData: req.body
                        });
                    }
                    else {
                        req.session.registeredUser = req.body;
                        req.session.signupEmail = req.body.email.toLowerCase();
                        req.session.signupPhone = req.body.phone;
                        req.session.loginOTP = await sendOTP(req.body.phone);
                        if(!req.session.loginOTP || req.session.loginOTP === null || req.session.loginOTP === undefined){
                            res.status(500).render('error', {
                                message: "Unable to send OTP at the moment. Please try again later",
                                errStatus : 500
                            });
                        } else{
                            res.redirect('/user/verify-otp');
                        }
                    }
                }).catch(err => {
                    res.status(500).render('error', {
                        message: "Unable to add user to database",
                        errStatus : 500
                    });
                    console.log(err);
                });
        }
    } catch(err){
        res.status(500).render('error', {
            message: "Unable to add user to database",
            errStatus : 500
        });
        console.log(err);
    }
};
async function addUserDetails(req, res) {
    try{
        const registeredUser = req.session.registeredUser
        const hashedPassword = await bcrypt.hash(registeredUser.password, 10);
        const user = new Userdb({
            firstName: registeredUser.firstName,
            lastName: registeredUser.lastName,
            email: registeredUser.email.toLowerCase(),
            phone: registeredUser.phone,
            password: hashedPassword,
            cart:{},
            updatedAt: Date.now(),
        })
        user.save()
            .then(async data => {
                console.log("Added new user data: " + data)
                delete data.password;     
                setSession(req, res, data);     
            })
            .catch(err => {
                res.status(500).render('error', {
                    message: "Unable to add user to database",
                    errStatus : 500
                });
                console.log(err);
            });
    } catch(err){
        res.status(500).render('error', {
            message: "Unable to add user to database",
            errStatus : 500
        });
        console.log(err);
    }
}

//login user to home page
exports.userLogin = async function(req, res){
    try{
        const userData = await loginAuthenticate(req.body);
        if(userData){
            delete userData.password;
            // req.session.signupEmail = userData.email;
            // req.session.loginOTP = await sendOTP(userData.phone);
            // res.render('user-otp',{
            //     phone: userData.phone
            // });            
            setSession(req, res, userData);
        }
        else{
            console.log("Login Error: " + err);
            res.render('user-login',{ errorMsg: err });
        }
    }catch(err){
        console.log("Login Error: " + err);
        res.render('user-login',{ errorMsg: err });
    }
};
//login authenticatin user
const loginAuthenticate = (body) => {
    return new Promise((resolve, reject) => {
        if (!body) {
            reject("Please input credentials");
        }
        else {
            try{
                Userdb.findOne({ email: body.email })
                .then(user => {
                    console.log(user);
                    if (user !== null) {
                        if(user.isActive){
                            bcrypt.compare(body.password, user.password)
                            .then((status) => {
                                if (status)
                                    resolve(user);
                                else
                                    reject("Password is incorrect!");
                                });
                            }
                        else
                            reject("User is blocked by the administrator! Kindly contact customer support for further details.");
                    }
                    else {
                        reject("No user found!");
                    }
                })
            } catch{
                reject("No user found!");
            }
        }
    });
};
//login OTP verification
exports.loginOTPVerify = async function(req, res) {
    try{
        const otp = req.body.otp;
        bcrypt.compare(otp, req.session.loginOTP)
            .then((status) => {
            if(status){
                addUserDetails(req, res)
            }
            else{
                res.status(400).render('error', {
                    message: "Oops..!! Wrong OTP.",
                    errStatus : 400
                });
                console.log("Oops..!! Wrong OTP.");
            }
        })    
    } catch{
        res.status(500).render('error', {
            message: "Unable to verify OTP",
            errStatus : 500
        });
        console.log("Unable to verify OTP");
    }           
};

//find and retrieve all user(s) to display in table
exports.getAllUsers = (req, res, next) => {
    try{
        Userdb.find({},{ password: 0, cart: 0, wishlist: 0, address: 0}).collation({locale: "en"})
        .sort({ firstName: 1, lastName: 1 }).lean()
        .then(data => {
            if(data.length !== 0){
                console.log("Data received: " + data);
                res.locals.users = data;
            }
            else{
                console.log("List is empty");
                res.locals.users = [];
            }
            next();            
        })
        .catch(err => {
            res.status(500).render('error', {
                message: "Unable to retrieve data from database",
                errStatus : 500
            });
            console.log(err);
        });
    } catch(err){
        res.status(500).render('error', {
            message: "Unable to retrieve data from database",
            errStatus : 500
        });
        console.log(err);
    }
};
//update single user by user_id in db
exports.updateSinlgleUser = (req, res) => {
    try{
        if (!req.body) {
            console.log("Data to update cannot be empty");
            return res.redirect('back');
        }
        const id = req.body.id;
        const user = {
            firstName: req.body.firstName,
            lastName: req.body.lastName,
            phone: req.body.phone,
            isActive: req.body.isActive === "on" ? true : false,
            updatedAt: Date.now(),
            _id: id
        };
        Userdb.findByIdAndUpdate(id, user)
            .then(data => {
                if (!data) {
                    res.status(500).render('error', {
                        message: "Unable to update user",
                        errStatus : 500
                    });
                    console.log("Unable to update user");
                }
                else {
                    const msg = "User details updated successfully!";
                    console.log(msg);
                    res.redirect('/admin/customers');
                }
            })
            .catch(err => {
                res.status(500).render('error', {
                    message: "Error updating user in Database",
                    errStatus : 500
                });
                console.log(err);
            });
    } catch(err){
        res.status(500).render('error', {
            message: "Error updating user in Database",
            errStatus : 500
        });
        console.log(err);
    }
};
//delete user with specified user_id from DB
exports.deleteUser = (req, res) => {
    try{
        if (!req.body) {
            console.log("User ID to delete cannot be empty");
            return res.status(500).render('error', {
                message: "User ID to delete cannot be empty",
                errStatus : 500
            });
        }
        const id = req.body.userID;
        console.log("ID for delete: " + id);
        Userdb.findByIdAndDelete(id)
            .then(data => {
                if (!data) {
                    res.status(500).render('error', {
                        message: "Unable to delete user. User data not found!",
                        errStatus : 500
                    });
                    console.log("Unable to delete user. User data not found!");
                }
                else {
                    console.log("Delete succes: " + data);
                    res.redirect('/admin/customers');
                }
            })
            .catch(err => {
                res.status(500).render('error', {
                    message: "Unable to delete user. Error deleting user in Database",
                    errStatus : 500
                });
                console.log(err);
            });
    } catch(err){
        res.status(500).render('error', {
            message: "Unable to delete user. Error deleting user in Database",
            errStatus : 500
        });
        console.log(err);
    }
};


//add new address to user address array
exports.addNewAddress = async (req, res) => {
    try{
        console.log("ADDING NEW ADDRESS ---------------->");
        console.log(req.body);
        if (!req.body) {
            console.log("Data to add cannot be empty");
            return res.redirect('back');
        }
        const id = req.session.user._id;
        const newAddress = {
            customerName: req.body.customerName,
            addressLine1: req.body.addressLine1,
            addressLine2: req.body.addressLine2,
            city: req.body.city,
            state: req.body.state,
            country: req.body.country,
            pincode: req.body.pincode,
            email: req.body.email,
            phone: req.body.phone,
            notes: req.body.notes,
            isDefault: req.body.isDefault === "on" ? true : false,
        };
        const user = await Userdb.findOne({_id: id}).lean();
        console.log(user);
        if(user){
            user.address.push(newAddress);
            user.updatedAt =  Date.now();
            user._id = id;

            await Userdb.findByIdAndUpdate(id, user)
                .then(data => {
                    if (!data) {
                        res.status(500).render('error', {
                            message: "Unable to add new address to user data",
                            errStatus : 500
                        });
                        console.log("Unable to add new address to user data");
                    }
                    else {
                        const msg = "New address added successfully!";
                        console.log(msg);
                        res.redirect('back');
                    }
                })
                .catch(err => {
                    res.status(500).render('error', {
                        message: "Error adding new address!",
                        errStatus : 500
                    });
                    console.log(err);
                });
        } else{
            res.status(500).render('error', {
                message: "Unable to add new address to user data",
                errStatus : 500
            });
            console.log(err);
        }      
    } catch{
        res.status(500).render('error', {
            message: "Unable to add new address to user data",
            errStatus : 500
        });
        console.log(err);
    }
};

exports.getAllAddresses = async (req, res, next) => {
    try{
        const id = req.session.user._id;
        await Userdb.findById(id)
            .then((user) => {
                console.log(user);
                if (user !== null){
                    res.locals.addresses = user.address;
                    console.log("Address: " + JSON.stringify(res.locals.addresses));
                }
                else{                    
                    console.log("Unable to find user to get addresses from database");
                }
                next();
            })
            .catch(err => {
                res.status(500).render('error', {
                    message: "Unable to retrieve data from database",
                    errStatus : 500
                });
                console.log("Unable to get addresses from database");
            })
    } catch{
        next();
    }
};

exports.editAddress = async (req, res) => {
    try{        
        console.log("EDITING EXISTING ADDRESS ---------------->");
        console.log(req.body);
        if (!req.body) {
            console.log("Data to update cannot be empty");
            return res.redirect('back');
        }
        const id = req.session.user._id;
        const editAddress = {
            customerName: req.body.customerName,
            addressLine1: req.body.addressLine1,
            addressLine2: req.body.addressLine2,
            city: req.body.city,
            state: req.body.state,
            country: req.body.country,
            pincode: req.body.pincode,
            email: req.body.email,
            phone: req.body.phone,
            notes: req.body.notes,
            isDefault: req.body.isDefault === "on" ? true : false,
            _id : req.body.id
        };
        const user = await Userdb.findOne({_id: id}).lean();
        console.log(user);
        if(user){
            let editUser;
            if(user.address.length !== 0){  
                for(let i in user.address){
                    if(user.address[i]._id.equals(new mongoose.Types.ObjectId(req.body.id)) ){
                        user.address.splice(i, 1);
                        user.address.push(editAddress);
                        break;
                    }
                }          
                editUser = new Userdb({
                    _id: id,
                    address: user.address,
                    updatedAt: Date.now()
                });
                console.log("EDITED USER ------------>>" + editUser);     
                await Userdb.findByIdAndUpdate(id, editUser)
                    .then(data => {
                        if (!data) {
                            res.status(500).render('error', {
                                message: "Unable to add new address to user data",
                                errStatus : 500
                            });
                            console.log("Unable to add new address to user data");
                        }
                        else {
                            const msg = "New address added successfully!";
                            console.log(msg);
                            res.redirect('/user#address');
                        }
                    })
                    .catch(err => {
                        res.status(500).render('error', {
                            message: "Error adding new address!",
                            errStatus : 500
                        });
                        console.log(err);
                    });     
            } else{
                res.status(500).render('error', {
                    message: "Error adding new address!",
                    errStatus : 500
                });
                console.log("User not found!");
            }        
        } else{
            res.status(500).render('error', {
                message: "Unable to add new address to user data",
                errStatus : 500
            });
            console.log(err);
        }      
    } catch{
        res.status(500).render('error', {
            message: "Unable to add new address to user data",
            errStatus : 500
        });
        console.log(err);
    }
};

exports.deleteAddress = async (req, res, next) => {
    try{
        console.log("DELETEING ADDRESS -------->");
        const addId = req.body.addressId;
        await Userdb.findOneAndUpdate({_id: req.session.user._id}, {
            $pull:{address: {_id: new mongoose.Types.ObjectId(addId)}}
            })
            .then(()=>{
                console.log("removed address from user data");
                res.redirect('back');
            })
            .catch(err => {
                res.status(500).render('error', {
                    message: "Unable to remove address from user data",
                    errStatus : 500
                });
                console.log(err);
            });
    } catch(err){
        res.status(500).render('error', {
            message: "Unable to remove address from user data",
            errStatus : 500
        });
        console.log(err);
    }
};

//User Wallet
exports.getUserWalletDetails = async (req, res, next) => {
    try{
        const id = req.session.user._id;
        await Userdb.findById(id)
            .then((user) => {
                console.log(user);
                if (user !== null && user.wallet !== undefined){
                    res.locals.walletDetails = user.wallet;
                    console.log("User Wallet: " + JSON.stringify(res.locals.walletDetails));
                }
                else{                    
                    console.log("Unable to find user to get user wallet details from database");
                }
                next();
            })
            .catch(err => {
                res.status(500).render('error', {
                    message: "Unable to retrieve data from database",
                    errStatus : 500
                });
                console.log("Unable to get user wallet details from database");
            })
    } catch{
        next();
    }
};

exports.getUserWalletBalance = (userId) => {
    try{
        return new Promise((resolve, reject) => {
            Userdb.findOne({_id: new mongoose.Types.ObjectId(userId)}, {_id:0, wallet:1})
            .then((userWallet) => {
                if(userWallet.wallet !== undefined){
                    if(userWallet.wallet.length !== 0){
                        let balance = 0;
                        userWallet.wallet.forEach((wallet)=>{
                            if(wallet.transaction === "C"){
                                balance += wallet.amount;
                            } else {
                                balance -= wallet.amount;
                            }
                        })
                        resolve(balance);
                    } else{
                        resolve(0);
                    }
                } else{
                    resolve(0);
                }
            }).catch((err) => {reject("Error finding wallet balance in Database. " + err)});            
        })
    } catch(err){
        console.log("Error finding wallet balance in Database. " + err);
    }
};

exports.getWalletBalance = async (req, res, next) => {
    try{
        const walletBalance =  await exports.getUserWalletBalance(req.session.user._id) ?? 0;
        console.log(walletBalance, " wallet balance");
        res.locals.walletBalance = walletBalance;
        next();       
    } catch(err){
        console.log("Error finding wallet balance in Database. " + err);
    }
};

exports.addToWalletGetRazorpay = async (req, res) => {
    console.log(req.body);
    const amount = Number(req.body.amount);
    console.log(amount);
    if(amount < 1)
        return res.json({status: false, errMsg:'Minimum amount should be ₹1'});
    const generatedWallet = await paymentHelper.generateWalletRazorpay(amount);
    console.log(generatedWallet);
    console.log(generatedWallet.amount);
    res.json({
        status: true, 
        razorpayOrder: generatedWallet, 
        user:{
            name: req.session.user.firstName, 
            email: req.session.user.email, 
            phone: req.session.user.phone}});
};

exports.verifyWalletRazorpayPayment = (req, res)=>{
    try{
        console.log("VERIFY PAYMENT: " + req.body);
        paymentHelper.verifyWalletPayment(req.body)
        .then(async ()=>{
            console.log("Payment SUCCESSFUL");
            const remarks = "Credited by you";
            console.log(remarks);
            const amount = req.body.amount;
            exports.addWalletTransactionToDb(req.session.user._id, amount, "C", remarks)
            .then((data)=>{
                res.json({status:true, data: data});
            })
            .catch((err)=>{
                console.log(err);
                res.json({status: false, errMsg:'Payment failed!'});
            });
        }).catch((err)=>{
            console.log(err);
            res.json({status: false, errMsg:'Payment failed!'});
        });
    } catch(err){
        console.log(err);
        res.json({status: false, errMsg:'Payment failed!'});
    }
} 

exports.addWalletTransactionToDb = async (userId, amount, transactionType, remarks) => {
    try{
        const newTransaction = {
            amount: Number(amount)/100,
            transaction: transactionType,
            remarks: remarks,
            timestamp: new Date()
        };
        return new Promise(async(resolve, reject) => {
            await Userdb.findByIdAndUpdate(userId, { $push: { wallet: newTransaction } })
                .then((user) => {console.log(JSON.stringify(newTransaction));resolve(newTransaction);})
                .catch((err)=>{console.log("rejected!!!!");reject(err);});
            })
    } catch(err){
        console.log("Error updating user wallet in Database. " + err);
    }
};

//------------- REPORTS -------------//

//find and retrieve new user(s) to display in dashboard
exports.getNewUsers = (req, res, next) => {
    try{
        Userdb.find({},{ firstName: 1, lastName: 1, email: 1, address: 1}).collation({locale: "en"})
        .sort({ createdAt: -1 }).limit(3).lean()
        .then(data => {
            if(data.length !== 0){
                console.log("newUsers received: " + data);
                res.locals.newUsers = data;
            }
            else{
                console.log("List is empty");
                res.locals.newUsers = [];
            }
            next();            
        })
        .catch(err => {
            console.log(err);
            next(); 
        });
    } catch(err){
        console.log(err);
        next(); 
    }
};