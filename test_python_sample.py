import os,sys
import json # unused import

def bad_function(x,y,z):
    if x==1: return "one"
    elif x==2:return "two"
    else:
        very_long_line_that_exceeds_reasonable_length_and_should_trigger_line_length_warnings_from_flake8="this is way too long"
        return very_long_line_that_exceeds_reasonable_length_and_should_trigger_line_length_warnings_from_flake8

class   TestClass:
    def __init__(self,name,age):
        self.name=name
        self.age=age

def function_with_trailing_whitespace():  
    x = 1    
    return x    

unused_var = "not used anywhere"

if __name__ == "__main__":
    print("Testing flake8 and black integration")